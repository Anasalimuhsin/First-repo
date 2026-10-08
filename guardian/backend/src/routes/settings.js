// Per-child configuration: geofences, screen-time schedules, daily limits,
// web/app filter rules and alert sensitivity (parent-authenticated).

import { Router } from 'express';
import { pool } from '../lib/db.js';
import { HttpError } from '../lib/auth.js';
import { parse, z, uuid, latitude, longitude, timeOfDay } from '../lib/validate.js';
import { childParam } from './children.js';

const SEVERITY = z.enum(['low', 'medium', 'high', 'critical']);
const CATEGORY = z.enum(['self_harm', 'bullying', 'grooming', 'violence', 'drugs', 'explicit_content']);

const GeofenceBody = z.object({
  name: z.string().trim().min(1).max(40),
  lat: latitude,
  lng: longitude,
  radiusM: z.number().int().min(50).max(5000),
  notifyEnter: z.boolean().default(true),
  notifyExit: z.boolean().default(true),
});

const ScheduleBody = z.object({
  name: z.string().trim().min(1).max(40),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  startsAt: timeOfDay,
  endsAt: timeOfDay,
  mode: z.enum(['block_internet', 'allowlist_only']),
  enabled: z.boolean().default(true),
}).refine((s) => s.startsAt !== s.endsAt, 'startsAt and endsAt must differ');

const LimitsBody = z.object({
  limits: z.array(z.object({
    target: z.enum(['app', 'web_category']),
    value: z.string().trim().min(1).max(200),
    minutes: z.number().int().min(0).max(1440),
  })).max(200),
});

const domain = z.string().trim().toLowerCase()
  .regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, 'invalid domain')
  .transform((d) => d.replace(/^www\./, ''));

const FilterRuleBody = z.discriminatedUnion('target', [
  z.object({ target: z.literal('domain'), value: domain, action: z.enum(['allow', 'block']), childId: uuid.nullable().default(null) }),
  z.object({ target: z.literal('web_category'), value: z.enum(['adult', 'gambling', 'violence', 'drugs', 'social_media', 'gaming', 'dating', 'proxy_vpn']), action: z.enum(['allow', 'block']), childId: uuid.nullable().default(null) }),
  z.object({ target: z.literal('app'), value: z.string().regex(/^[a-zA-Z][\w]*(\.[a-zA-Z_][\w]*)+$/, 'expected a package / bundle id'), action: z.enum(['allow', 'block']), childId: uuid.nullable().default(null) }),
]);

const AlertSettingsBody = z.object({
  settings: z.array(z.object({ category: CATEGORY, enabled: z.boolean(), minSeverity: SEVERITY })).min(1),
});

export function settingsRouter() {
  const router = Router();
  router.param('childId', childParam);

  // ── Geofences ──

  router.get('/children/:childId/geofences', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, name, lat, lng, radius_m AS "radiusM", notify_enter AS "notifyEnter", notify_exit AS "notifyExit"
         FROM geofences WHERE child_id = $1 ORDER BY created_at`,
      [req.params.childId],
    );
    res.json({ geofences: rows });
  });

  router.post('/children/:childId/geofences', async (req, res) => {
    const b = parse(GeofenceBody, req.body);
    const { rows: [row] } = await pool.query(
      `INSERT INTO geofences (child_id, name, lat, lng, radius_m, notify_enter, notify_exit)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.params.childId, b.name, b.lat, b.lng, b.radiusM, b.notifyEnter, b.notifyExit],
    );
    res.status(201).json({ id: row.id, ...b });
  });

  router.put('/children/:childId/geofences/:id', async (req, res) => {
    const b = parse(GeofenceBody, req.body);
    const { rowCount } = await pool.query(
      `UPDATE geofences SET name = $3, lat = $4, lng = $5, radius_m = $6, notify_enter = $7, notify_exit = $8
        WHERE id = $1 AND child_id = $2`,
      [parse(uuid, req.params.id), req.params.childId, b.name, b.lat, b.lng, b.radiusM, b.notifyEnter, b.notifyExit],
    );
    if (rowCount === 0) throw new HttpError(404, 'Geofence not found');
    // Moving a fence invalidates the inside/outside state.
    await pool.query('DELETE FROM geofence_states WHERE geofence_id = $1', [req.params.id]);
    res.json({ id: req.params.id, ...b });
  });

  router.delete('/children/:childId/geofences/:id', async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM geofences WHERE id = $1 AND child_id = $2',
      [parse(uuid, req.params.id), req.params.childId]);
    if (rowCount === 0) throw new HttpError(404, 'Geofence not found');
    res.status(204).end();
  });

  // ── Screen-time schedules ──

  const scheduleColumns = `id, name, days_of_week AS "daysOfWeek", to_char(starts_at, 'HH24:MI') AS "startsAt",
                           to_char(ends_at, 'HH24:MI') AS "endsAt", mode, enabled`;

  router.get('/children/:childId/schedules', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${scheduleColumns} FROM screen_time_schedules WHERE child_id = $1 ORDER BY starts_at`,
      [req.params.childId],
    );
    res.json({ schedules: rows });
  });

  router.post('/children/:childId/schedules', async (req, res) => {
    const b = parse(ScheduleBody, req.body);
    const { rows: [row] } = await pool.query(
      `INSERT INTO screen_time_schedules (child_id, name, days_of_week, starts_at, ends_at, mode, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${scheduleColumns}`,
      [req.params.childId, b.name, [...new Set(b.daysOfWeek)].sort(), b.startsAt, b.endsAt, b.mode, b.enabled],
    );
    res.status(201).json(row);
  });

  router.put('/children/:childId/schedules/:id', async (req, res) => {
    const b = parse(ScheduleBody, req.body);
    const { rows: [row] } = await pool.query(
      `UPDATE screen_time_schedules SET name = $3, days_of_week = $4, starts_at = $5, ends_at = $6, mode = $7, enabled = $8
        WHERE id = $1 AND child_id = $2 RETURNING ${scheduleColumns}`,
      [parse(uuid, req.params.id), req.params.childId, b.name, [...new Set(b.daysOfWeek)].sort(), b.startsAt, b.endsAt, b.mode, b.enabled],
    );
    if (!row) throw new HttpError(404, 'Schedule not found');
    res.json(row);
  });

  router.delete('/children/:childId/schedules/:id', async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM screen_time_schedules WHERE id = $1 AND child_id = $2',
      [parse(uuid, req.params.id), req.params.childId]);
    if (rowCount === 0) throw new HttpError(404, 'Schedule not found');
    res.status(204).end();
  });

  // ── Daily limits (replace the whole set) ──

  router.get('/children/:childId/daily-limits', async (req, res) => {
    const { rows } = await pool.query('SELECT target, value, minutes FROM daily_limits WHERE child_id = $1 ORDER BY value', [req.params.childId]);
    res.json({ limits: rows });
  });

  router.put('/children/:childId/daily-limits', async (req, res) => {
    const { limits } = parse(LimitsBody, req.body);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM daily_limits WHERE child_id = $1', [req.params.childId]);
      for (const l of limits) {
        await client.query(
          `INSERT INTO daily_limits (child_id, target, value, minutes) VALUES ($1, $2, $3, $4)
           ON CONFLICT (child_id, target, value) DO UPDATE SET minutes = EXCLUDED.minutes`,
          [req.params.childId, l.target, l.value, l.minutes],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    res.json({ limits });
  });

  // ── Alert sensitivity ──

  router.get('/children/:childId/alert-settings', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT category, enabled, min_severity AS "minSeverity" FROM alert_settings WHERE child_id = $1 ORDER BY category`,
      [req.params.childId],
    );
    res.json({ settings: rows });
  });

  router.put('/children/:childId/alert-settings', async (req, res) => {
    const { settings } = parse(AlertSettingsBody, req.body);
    for (const s of settings) {
      if (s.category === 'self_harm' && !s.enabled) {
        // Deliberate: self-harm alerts can be tuned but not switched off.
        throw new HttpError(400, 'Self-harm alerts cannot be disabled');
      }
      await pool.query(
        `INSERT INTO alert_settings (child_id, category, enabled, min_severity) VALUES ($1, $2, $3, $4)
         ON CONFLICT (child_id, category) DO UPDATE SET enabled = EXCLUDED.enabled, min_severity = EXCLUDED.min_severity`,
        [req.params.childId, s.category, s.enabled, s.minSeverity],
      );
    }
    res.json({ settings });
  });

  return router;
}

/** Family-wide and per-child filter rules (keyed by family, not child). */
export function filterRulesRouter() {
  const router = Router();

  async function family(req) {
    const { rows } = await pool.query(
      `SELECT family_id FROM family_members WHERE parent_id = $1 ORDER BY role LIMIT 1`, [req.parent.id]);
    if (!rows[0]) throw new HttpError(404, 'No family');
    return rows[0].family_id;
  }

  router.get('/filter-rules', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, child_id AS "childId", target, value, action, created_at AS "createdAt"
         FROM filter_rules WHERE family_id = $1 ORDER BY created_at`,
      [await family(req)],
    );
    res.json({ rules: rows });
  });

  router.post('/filter-rules', async (req, res) => {
    const b = parse(FilterRuleBody, req.body);
    const familyId = await family(req);
    if (b.childId) {
      const { rowCount } = await pool.query('SELECT 1 FROM children WHERE id = $1 AND family_id = $2', [b.childId, familyId]);
      if (rowCount === 0) throw new HttpError(404, 'Child not found');
    }
    const { rows: [row] } = await pool.query(
      `INSERT INTO filter_rules (family_id, child_id, target, value, action, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (family_id, COALESCE(child_id, '00000000-0000-0000-0000-000000000000'::uuid), target, value)
       DO UPDATE SET action = EXCLUDED.action
       RETURNING id, child_id AS "childId", target, value, action`,
      [familyId, b.childId, b.target, b.value, b.action, req.parent.id],
    );
    res.status(201).json(row);
  });

  router.delete('/filter-rules/:id', async (req, res) => {
    const { rowCount } = await pool.query('DELETE FROM filter_rules WHERE id = $1 AND family_id = $2',
      [parse(uuid, req.params.id), await family(req)]);
    if (rowCount === 0) throw new HttpError(404, 'Rule not found');
    res.status(204).end();
  });

  return router;
}
