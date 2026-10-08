-- Guardian — PostgreSQL schema (MVP)
--
-- Design principles:
--   * Data minimisation: full message contents are NEVER stored. The device
--     (or ingestion worker) sends text, it is analysed in memory, and only a
--     short encrypted excerpt of flagged messages is kept as an alert.
--   * Sensitive columns (*_enc) are encrypted in the application with
--     AES-256-GCM (see src/lib/fieldCrypto.js) — the database never sees them
--     in plaintext, on top of disk-level encryption.
--   * Retention is explicit: alerts and locations carry expires_at and a
--     scheduled job deletes expired rows (see bottom of file).
--   * Every parent read of child data is written to audit_log.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;

-- ───────────────────────── Enums ─────────────────────────

CREATE TYPE alert_category AS ENUM ('self_harm', 'bullying', 'grooming', 'violence', 'drugs', 'explicit_content', 'other');
CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE alert_status   AS ENUM ('new', 'viewed', 'resolved', 'dismissed');
CREATE TYPE content_source AS ENUM ('sms', 'email', 'instagram', 'tiktok', 'snapchat', 'whatsapp', 'discord', 'youtube', 'web', 'other');
CREATE TYPE device_platform AS ENUM ('ios', 'android');
CREATE TYPE family_role    AS ENUM ('owner', 'guardian');
CREATE TYPE rule_action    AS ENUM ('allow', 'block');
CREATE TYPE filter_target  AS ENUM ('domain', 'web_category', 'app');

-- ───────────────────── Accounts & families ─────────────────────

CREATE TABLE parents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL UNIQUE,
  password_hash  text   NOT NULL,           -- scrypt (see src/lib/passwords.js)
  full_name      text   NOT NULL,
  locale         text   NOT NULL DEFAULT 'ar',
  mfa_secret_enc text,                       -- TOTP secret, encrypted
  mfa_enabled    boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

CREATE TABLE parent_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id    uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,         -- sha256 of the bearer token
  push_token   text,                         -- FCM token of this parent device
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);

CREATE TABLE families (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  timezone    text NOT NULL DEFAULT 'Asia/Riyadh',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE family_members (
  family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  parent_id  uuid NOT NULL REFERENCES parents(id)  ON DELETE CASCADE,
  role       family_role NOT NULL DEFAULT 'guardian',
  PRIMARY KEY (family_id, parent_id)
);

CREATE TABLE children (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  display_name  text NOT NULL,               -- a nickname is enough
  birth_year    smallint NOT NULL CHECK (birth_year BETWEEN 2000 AND 2100),  -- year only, not full DOB
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);

-- Verifiable parental consent (COPPA) and what monitoring was agreed to.
-- Monitoring of a category is only active while a non-revoked consent covers it.
CREATE TABLE consents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id         uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  parent_id        uuid NOT NULL REFERENCES parents(id),
  policy_version   text NOT NULL,
  scopes           text[] NOT NULL,          -- e.g. {content_monitoring,location,screen_time,llm_analysis}
  method           text NOT NULL,            -- e.g. 'card_verification', 'signed_form', 'id_check'
  verification_ref text,                     -- provider reference, e.g. Stripe SetupIntent id
  child_notified   boolean NOT NULL DEFAULT false,  -- age-appropriate notice shown to the child
  granted_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz
);
CREATE INDEX consents_active_idx ON consents (child_id) WHERE revoked_at IS NULL;

-- ───────────────────── Devices & linked accounts ─────────────────────

CREATE TABLE devices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id         uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  platform         device_platform NOT NULL,
  model            text,
  app_version      text,
  token_hash       text NOT NULL UNIQUE,     -- sha256 of the device bearer token
  enrolled_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz,
  revoked_at       timestamptz
);
CREATE INDEX devices_child_idx ON devices (child_id);

-- One-time codes a parent generates to pair a child's device (shown as QR).
CREATE TABLE pairing_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id    uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  code_hash   text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

-- Accounts monitored via official APIs/OAuth (e.g. Gmail).
CREATE TABLE monitored_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id         uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  source           content_source NOT NULL,
  provider         text NOT NULL,            -- 'gmail'
  handle_hash      text NOT NULL,            -- hashed address/username, not the plaintext
  oauth_tokens_enc text,                     -- encrypted refresh/access token JSON
  sync_cursor      text,                     -- provider-specific position (Gmail: last internalDate ms)
  last_synced_at   timestamptz,
  last_error       text,
  connected_at     timestamptz NOT NULL DEFAULT now(),
  disconnected_at  timestamptz,
  UNIQUE (child_id, provider, handle_hash)
);

-- CSRF state for OAuth connect flows; single use, short-lived.
CREATE TABLE oauth_states (
  state_hash  text PRIMARY KEY,
  parent_id   uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  child_id    uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  provider    text NOT NULL,
  expires_at  timestamptz NOT NULL
);

-- ───────────────────── Content monitoring & alerts ─────────────────────

-- Per-child sensitivity per category.
CREATE TABLE alert_settings (
  child_id      uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  category      alert_category NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  min_severity  alert_severity NOT NULL DEFAULT 'medium',
  PRIMARY KEY (child_id, category)
);

CREATE TABLE alerts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id          uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  device_id         uuid REFERENCES devices(id) ON DELETE SET NULL,
  source            content_source NOT NULL,
  direction         text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  category          alert_category NOT NULL,
  severity          alert_severity NOT NULL,
  confidence        real NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  detector          text NOT NULL,           -- 'rules' | 'rules+llm'
  matched_terms     text[] NOT NULL DEFAULT '{}',
  excerpt_enc       text NOT NULL,           -- encrypted, ≤ 280 chars of context
  rationale_ar      text,                    -- one-line explanation for the parent
  status            alert_status NOT NULL DEFAULT 'new',
  occurred_at       timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_by       uuid REFERENCES parents(id),
  resolved_at       timestamptz,
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '90 days'
);
CREATE INDEX alerts_child_feed_idx ON alerts (child_id, created_at DESC);
CREATE INDEX alerts_open_idx       ON alerts (child_id, severity) WHERE status IN ('new', 'viewed');
CREATE INDEX alerts_expiry_idx     ON alerts (expires_at);

CREATE TABLE alert_notifications (
  id          bigserial PRIMARY KEY,
  alert_id    uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  parent_id   uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('push', 'email', 'sms')),
  sent_at     timestamptz NOT NULL DEFAULT now(),
  delivered   boolean
);

-- ───────────────────── Screen time & filtering ─────────────────────

CREATE TABLE screen_time_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id      uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  name          text NOT NULL,                       -- 'وقت النوم', 'وقت المذاكرة'
  days_of_week  smallint[] NOT NULL,                 -- 0 = Sunday … 6 = Saturday
  starts_at     time NOT NULL,
  ends_at       time NOT NULL,                       -- may be < starts_at (crosses midnight)
  mode          text NOT NULL CHECK (mode IN ('block_internet', 'allowlist_only')),
  enabled       boolean NOT NULL DEFAULT true,
  CHECK (days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
);

CREATE TABLE daily_limits (
  child_id      uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  target        filter_target NOT NULL CHECK (target IN ('app', 'web_category')),
  value         text NOT NULL,                       -- bundle id / category
  minutes       smallint NOT NULL CHECK (minutes BETWEEN 0 AND 1440),
  PRIMARY KEY (child_id, target, value)
);

-- child_id NULL = applies to every child in the family.
CREATE TABLE filter_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  child_id    uuid REFERENCES children(id) ON DELETE CASCADE,
  target      filter_target NOT NULL,
  value       text NOT NULL,                         -- 'example.com' / 'adult' / 'com.example.app'
  action      rule_action NOT NULL,
  created_by  uuid REFERENCES parents(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX filter_rules_unique_idx
  ON filter_rules (family_id, COALESCE(child_id, '00000000-0000-0000-0000-000000000000'::uuid), target, value);

-- ───────────────────── Location ─────────────────────

CREATE TABLE geofences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id        uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  name            text NOT NULL,                     -- 'المدرسة', 'المنزل'
  lat             double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng             double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  radius_m        integer NOT NULL CHECK (radius_m BETWEEN 50 AND 5000),
  notify_enter    boolean NOT NULL DEFAULT true,
  notify_exit     boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Current inside/outside state, used for enter/exit detection.
CREATE TABLE geofence_states (
  geofence_id  uuid PRIMARY KEY REFERENCES geofences(id) ON DELETE CASCADE,
  inside       boolean NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE geofence_events (
  id           bigserial PRIMARY KEY,
  geofence_id  uuid NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
  child_id     uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  event        text NOT NULL CHECK (event IN ('enter', 'exit')),
  occurred_at  timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX geofence_events_child_idx ON geofence_events (child_id, occurred_at DESC);

-- Raw location history: short retention (30 days by default).
CREATE TABLE location_points (
  id           bigserial PRIMARY KEY,
  child_id     uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  device_id    uuid REFERENCES devices(id) ON DELETE SET NULL,
  lat          double precision NOT NULL,
  lng          double precision NOT NULL,
  accuracy_m   real,
  battery_pct  smallint,
  recorded_at  timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX location_points_latest_idx ON location_points (child_id, recorded_at DESC);
CREATE INDEX location_points_expiry_idx ON location_points (expires_at);

-- ───────────────────── Audit ─────────────────────

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_type  text NOT NULL CHECK (actor_type IN ('parent', 'device', 'system', 'admin')),
  actor_id    uuid,
  action      text NOT NULL,                 -- 'alert.view', 'location.view', 'consent.revoke'…
  child_id    uuid,
  target_id   uuid,
  ip          inet,
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_child_idx ON audit_log (child_id, at DESC);

-- ───────────────────── Retention ─────────────────────
-- Enforced by src/jobs/retention.js (run by src/worker.js every hour), which
-- deletes expired alerts, locations, geofence events, sessions, pairing codes,
-- OAuth states and audit entries older than one year.
