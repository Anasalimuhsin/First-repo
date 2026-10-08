// Endpoints called by the child's device (the mobile app).

import { Router } from 'express';
import { pool, withTransaction } from '../lib/db.js';
import { requireDevice, requireScope, parentPushTokens, HttpError } from '../lib/auth.js';
import { evaluateGeofence } from '../lib/geo.js';
import { analyzeMessage } from '../analyzer/index.js';
import { SEVERITIES } from '../analyzer/lexicon.js';

const SOURCES = new Set(['sms', 'email', 'instagram', 'tiktok', 'snapchat', 'whatsapp', 'discord', 'youtube', 'web', 'other']);
const MAX_BATCH = 100;
const MAX_TEXT = 10_000;
const EXCERPT_LENGTH = 280;

function parseDate(value, field) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${field} must be an ISO date`);
  return d;
}

export function deviceRouter({ fieldCrypto, notifier, classify }) {
  const router = Router();
  router.use(requireDevice);

  /**
   * POST /v1/device/messages
   * { items: [{ source, direction, text, occurredAt }] }
   *
   * Text is analysed in memory and discarded. Only alerts are persisted.
   */
  router.post('/messages', requireScope('content_monitoring'), async (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_BATCH) {
      throw new HttpError(400, `items must be an array of 1..${MAX_BATCH}`);
    }
    for (const item of items) {
      if (!SOURCES.has(item.source)) throw new HttpError(400, `Unknown source "${item.source}"`);
      if (!['incoming', 'outgoing'].includes(item.direction)) throw new HttpError(400, 'Invalid direction');
      if (typeof item.text !== 'string' || item.text.length > MAX_TEXT) throw new HttpError(400, 'Invalid text');
      item.occurredAt = parseDate(item.occurredAt, 'occurredAt');
    }

    const { childId } = req.device;
    const llmAllowed = req.device.scopes.includes('llm_analysis') ? classify : null;

    const { rows: settingRows } = await pool.query(
      'SELECT category, enabled, min_severity FROM alert_settings WHERE child_id = $1',
      [childId],
    );
    const settings = new Map(settingRows.map((r) => [r.category, r]));

    const created = [];
    for (const item of items) {
      const result = await analyzeMessage(item, { classify: llmAllowed });
      if (!result.alert) continue;

      const setting = settings.get(result.category) ?? { enabled: true, min_severity: 'medium' };
      if (!setting.enabled) continue;
      if (SEVERITIES.indexOf(result.severity) < SEVERITIES.indexOf(setting.min_severity)) continue;

      const excerpt = item.text.slice(0, EXCERPT_LENGTH);
      const { rows } = await pool.query(
        `INSERT INTO alerts (child_id, device_id, source, direction, category, severity, confidence,
                             detector, matched_terms, excerpt_enc, rationale_ar, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [childId, req.device.id, item.source, item.direction, result.category, result.severity,
         result.confidence, result.detector, result.matchedTerms,
         fieldCrypto.encrypt(excerpt, childId), result.rationaleAr, item.occurredAt],
      );
      created.push({ id: rows[0].id, category: result.category, severity: result.severity, labelAr: result.labelAr });
    }

    if (created.length > 0) {
      const [{ display_name: childName }] = (
        await pool.query('SELECT display_name FROM children WHERE id = $1', [childId])
      ).rows;
      const tokens = await parentPushTokens(childId);
      for (const alert of created) {
        await notifier.alertCreated({ parentPushTokens: tokens, childName, alertId: alert.id, ...alert });
      }
    }

    // The device learns only how many alerts were raised, never their content,
    // so a child can't use the response to probe the filter.
    res.json({ received: items.length, alertsCreated: created.length });
  });

  /**
   * POST /v1/device/locations
   * { points: [{ lat, lng, accuracyM, batteryPct, recordedAt }] }  (oldest first)
   */
  router.post('/locations', requireScope('location'), async (req, res) => {
    const points = req.body?.points;
    if (!Array.isArray(points) || points.length === 0 || points.length > MAX_BATCH) {
      throw new HttpError(400, `points must be an array of 1..${MAX_BATCH}`);
    }
    for (const p of points) {
      if (!Number.isFinite(p.lat) || Math.abs(p.lat) > 90 || !Number.isFinite(p.lng) || Math.abs(p.lng) > 180) {
        throw new HttpError(400, 'Invalid coordinates');
      }
      p.recordedAt = parseDate(p.recordedAt, 'recordedAt');
    }
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
      const [{ display_name: childName }] = (
        await pool.query('SELECT display_name FROM children WHERE id = $1', [childId])
      ).rows;
      const tokens = await parentPushTokens(childId);
      for (const e of events) await notifier.geofenceEvent({ parentPushTokens: tokens, childName, ...e });
    }

    res.json({ received: points.length, geofenceEvents: events.length });
  });

  /**
   * GET /v1/device/policy
   * Screen-time schedules, daily limits and filter rules the device enforces
   * locally (iOS Screen Time API / Android DevicePolicyManager + local VPN DNS filter).
   */
  router.get('/policy', requireScope('screen_time'), async (req, res) => {
    const { childId } = req.device;
    const [schedules, limits, filters] = await Promise.all([
      pool.query(
        `SELECT id, name, days_of_week AS "daysOfWeek", starts_at AS "startsAt", ends_at AS "endsAt", mode
           FROM screen_time_schedules WHERE child_id = $1 AND enabled`,
        [childId],
      ),
      pool.query('SELECT target, value, minutes FROM daily_limits WHERE child_id = $1', [childId]),
      pool.query(
        `SELECT f.target, f.value, f.action FROM filter_rules f
           JOIN children ch ON ch.family_id = f.family_id
          WHERE ch.id = $1 AND (f.child_id IS NULL OR f.child_id = $1)`,
        [childId],
      ),
    ]);
    const { rows: [family] } = await pool.query(
      'SELECT f.timezone FROM families f JOIN children ch ON ch.family_id = f.id WHERE ch.id = $1',
      [childId],
    );
    res.json({
      timezone: family.timezone,
      schedules: schedules.rows,
      dailyLimits: limits.rows,
      filterRules: filters.rows,
    });
  });

  return router;
}
