// Endpoints called by the child's device (the mobile app).

import { Router } from 'express';
import { pool, withTransaction } from '../lib/db.js';
import { requireDevice, requireScope, parentPushTokens, HttpError } from '../lib/auth.js';
import { hashToken, generateToken } from '../lib/fieldCrypto.js';
import { evaluateGeofence } from '../lib/geo.js';
import { parse, z, isoDate, latitude, longitude } from '../lib/validate.js';
import { processTextItems, processImageSignals, IMAGE_LABELS } from '../services/alerts.js';

export const SOURCES = ['sms', 'email', 'instagram', 'tiktok', 'snapchat', 'whatsapp', 'discord', 'youtube', 'web', 'other'];
const MAX_BATCH = 100;

const direction = z.enum(['incoming', 'outgoing']);

const PairBody = z.object({
  code: z.string().regex(/^\d{8}$/, 'expected an 8-digit code'),
  platform: z.enum(['ios', 'android']),
  model: z.string().max(100).optional(),
  appVersion: z.string().max(30).optional(),
});

const MessagesBody = z.object({
  items: z.array(z.object({
    source: z.enum(SOURCES),
    direction,
    text: z.string().max(10_000),
    occurredAt: isoDate,
  })).min(1).max(MAX_BATCH),
});

const ImageSignalsBody = z.object({
  items: z.array(z.object({
    source: z.enum(SOURCES),
    direction,
    occurredAt: isoDate,
    labels: z.array(z.object({ label: z.string().max(40), score: z.number().min(0).max(1) })).max(20),
  })).min(1).max(MAX_BATCH),
});

const LocationsBody = z.object({
  points: z.array(z.object({
    lat: latitude,
    lng: longitude,
    accuracyM: z.number().min(0).max(100_000).optional(),
    batteryPct: z.number().int().min(0).max(100).optional(),
    recordedAt: isoDate,
  })).min(1).max(MAX_BATCH),
});

export function deviceRouter({ fieldCrypto, notifier, classify, classifyBatch, pairLimiter }) {
  const router = Router();

  /**
   * POST /v1/device/pair  { code, platform, model?, appVersion? }
   * Exchanges a one-time code (created by a parent) for a device token.
   * Unauthenticated, so it is rate limited.
   */
  router.post('/pair', pairLimiter, async (req, res) => {
    const body = parse(PairBody, req.body);
    const deviceToken = generateToken();

    const result = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `UPDATE pairing_codes SET used_at = now()
          WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
          RETURNING child_id`,
        [hashToken(body.code)],
      );
      if (!rows[0]) throw new HttpError(400, 'Invalid or expired code');
      const childId = rows[0].child_id;
      const { rows: [device] } = await db.query(
        `INSERT INTO devices (child_id, platform, model, app_version, token_hash)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [childId, body.platform, body.model ?? null, body.appVersion ?? null, hashToken(deviceToken)],
      );
      const { rows: [child] } = await db.query('SELECT display_name FROM children WHERE id = $1', [childId]);
      return { deviceId: device.id, childId, displayName: child.display_name };
    });

    res.status(201).json({ deviceToken, ...result });
  });

  router.use(requireDevice);

  /**
   * GET /v1/device/me — what is being monitored, for the child's
   * transparency screen.
   */
  router.get('/me', async (req, res) => {
    const { rows: [child] } = await pool.query('SELECT display_name FROM children WHERE id = $1', [req.device.childId]);
    res.json({ deviceId: req.device.id, displayName: child.display_name, scopes: req.device.scopes });
  });

  /**
   * POST /v1/device/messages
   * { items: [{ source, direction, text, occurredAt }] }
   * Text is analysed in memory and discarded. Only alerts are persisted.
   */
  router.post('/messages', requireScope('content_monitoring'), async (req, res) => {
    const { items } = parse(MessagesBody, req.body);
    const created = await processTextItems({
      childId: req.device.childId, deviceId: req.device.id, items,
      scopes: req.device.scopes, classify, classifyBatch, fieldCrypto, notifier,
    });
    // The device learns only how many alerts were raised, never their content.
    res.json({ received: items.length, alertsCreated: created.length });
  });

  /**
   * POST /v1/device/image-signals
   * { items: [{ source, direction, occurredAt, labels: [{ label, score }] }] }
   * Results of the on-device image classifier. Images never leave the device.
   */
  router.post('/image-signals', requireScope('content_monitoring'), async (req, res) => {
    const { items } = parse(ImageSignalsBody, req.body);
    const created = await processImageSignals({
      childId: req.device.childId, deviceId: req.device.id, items, fieldCrypto, notifier,
    });
    res.json({ received: items.length, alertsCreated: created.length, knownLabels: Object.keys(IMAGE_LABELS) });
  });

  /**
   * POST /v1/device/locations
   * { points: [{ lat, lng, accuracyM, batteryPct, recordedAt }] }
   */
  router.post('/locations', requireScope('location'), async (req, res) => {
    const points = parse(LocationsBody, req.body).points.sort((a, b) => a.recordedAt - b.recordedAt);
    const { childId } = req.device;

    const events = await withTransaction(async (db) => {
      for (const p of points) {
        await db.query(
          `INSERT INTO location_points (child_id, device_id, lat, lng, accuracy_m, battery_pct, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [childId, req.device.id, p.lat, p.lng, p.accuracyM ?? null, p.batteryPct ?? null, p.recordedAt],
        );
      }

      const { rows: fences } = await db.query(
        `SELECT g.id, g.name, g.lat, g.lng, g.radius_m AS "radiusM", g.notify_enter, g.notify_exit,
                COALESCE(s.inside, false) AS inside
           FROM geofences g LEFT JOIN geofence_states s ON s.geofence_id = g.id
          WHERE g.child_id = $1
          FOR UPDATE OF g`,
        [childId],
      );

      const fired = [];
      for (const fence of fences) {
        let inside = fence.inside;
        for (const p of points) {
          const r = evaluateGeofence(fence, p, inside);
          inside = r.inside;
          if (!r.event) continue;
          await db.query(
            `INSERT INTO geofence_events (geofence_id, child_id, event, occurred_at) VALUES ($1, $2, $3, $4)`,
            [fence.id, childId, r.event, p.recordedAt],
          );
          if ((r.event === 'enter' && fence.notify_enter) || (r.event === 'exit' && fence.notify_exit)) {
            fired.push({ placeName: fence.name, event: r.event });
          }
        }
        await db.query(
          `INSERT INTO geofence_states (geofence_id, inside, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (geofence_id) DO UPDATE SET inside = EXCLUDED.inside, updated_at = now()`,
          [fence.id, inside],
        );
      }
      return fired;
    });

    if (events.length > 0) {
      const { rows: [child] } = await pool.query('SELECT display_name FROM children WHERE id = $1', [childId]);
      const tokens = await parentPushTokens(childId);
      for (const e of events) await notifier.geofenceEvent({ parentPushTokens: tokens, childName: child.display_name, ...e });
    }

    res.json({ received: points.length, geofenceEvents: events.length });
  });

  /**
   * GET /v1/device/policy
   * Screen-time schedules, daily limits and filter rules the device enforces
   * locally (Android VpnService DNS filter + usage monitor; iOS Screen Time API).
   */
  router.get('/policy', requireScope('screen_time'), async (req, res) => {
    const { childId } = req.device;
    const [schedules, limits, filters, family] = await Promise.all([
      pool.query(
        `SELECT id, name, days_of_week AS "daysOfWeek", to_char(starts_at, 'HH24:MI') AS "startsAt",
                to_char(ends_at, 'HH24:MI') AS "endsAt", mode
           FROM screen_time_schedules WHERE child_id = $1 AND enabled ORDER BY starts_at`,
        [childId],
      ),
      pool.query('SELECT target, value, minutes FROM daily_limits WHERE child_id = $1 ORDER BY value', [childId]),
      // A child-specific rule overrides a family-wide rule for the same target/value.
      pool.query(
        `SELECT DISTINCT ON (f.target, f.value) f.target, f.value, f.action
           FROM filter_rules f JOIN children ch ON ch.family_id = f.family_id
          WHERE ch.id = $1 AND (f.child_id IS NULL OR f.child_id = $1)
          ORDER BY f.target, f.value, (f.child_id IS NULL)`,
        [childId],
      ),
      pool.query('SELECT f.timezone FROM families f JOIN children ch ON ch.family_id = f.id WHERE ch.id = $1', [childId]),
    ]);
    res.json({
      timezone: family.rows[0].timezone,
      schedules: schedules.rows,
      dailyLimits: limits.rows,
      filterRules: filters.rows,
    });
  });

  return router;
}
