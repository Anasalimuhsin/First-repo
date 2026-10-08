// Endpoints for the parent dashboard (web) and parent mobile app.

import { Router } from 'express';
import { pool } from '../lib/db.js';
import { requireParent, assertParentCanAccessChild, audit, HttpError } from '../lib/auth.js';

const STATUSES = new Set(['viewed', 'resolved', 'dismissed']);

export function parentRouter({ fieldCrypto }) {
  const router = Router();
  router.use(requireParent);

  /** GET /v1/children — children in the parent's families, with open alert counts. */
  router.get('/children', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ch.id, ch.display_name AS "displayName", ch.birth_year AS "birthYear",
              (SELECT count(*)::int FROM alerts a
                WHERE a.child_id = ch.id AND a.status = 'new') AS "newAlerts"
         FROM children ch
         JOIN family_members fm ON fm.family_id = ch.family_id
        WHERE fm.parent_id = $1 AND ch.deleted_at IS NULL
        ORDER BY ch.display_name`,
      [req.parent.id],
    );
    res.json({ children: rows });
  });

  /** GET /v1/children/:childId/alerts?status=new&before=<iso>&limit=50 — feed without excerpts. */
  router.get('/children/:childId/alerts', async (req, res) => {
    const { childId } = req.params;
    await assertParentCanAccessChild(req.parent.id, childId);

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before ? new Date(req.query.before) : new Date();
    if (Number.isNaN(before.getTime())) throw new HttpError(400, 'Invalid "before"');
    const status = req.query.status ?? null;
    if (status !== null && !STATUSES.has(status) && status !== 'new') throw new HttpError(400, 'Invalid status');

    const { rows } = await pool.query(
      `SELECT id, source, direction, category, severity, confidence, rationale_ar AS "rationaleAr",
              status, occurred_at AS "occurredAt", created_at AS "createdAt"
         FROM alerts
        WHERE child_id = $1 AND created_at < $2 AND ($3::alert_status IS NULL OR status = $3)
        ORDER BY created_at DESC
        LIMIT $4`,
      [childId, before, status, limit],
    );
    res.json({ alerts: rows });
  });

  /** GET /v1/alerts/:alertId — full alert including the decrypted excerpt. Audited. */
  router.get('/alerts/:alertId', async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM alerts WHERE id = $1', [req.params.alertId]);
    const alert = rows[0];
    if (!alert) throw new HttpError(404, 'Alert not found');
    await assertParentCanAccessChild(req.parent.id, alert.child_id);

    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'alert.view',
                  childId: alert.child_id, targetId: alert.id, ip: req.ip });
    if (alert.status === 'new') {
      await pool.query(`UPDATE alerts SET status = 'viewed' WHERE id = $1 AND status = 'new'`, [alert.id]);
    }

    res.json({
      id: alert.id,
      childId: alert.child_id,
      source: alert.source,
      direction: alert.direction,
      category: alert.category,
      severity: alert.severity,
      confidence: alert.confidence,
      detector: alert.detector,
      matchedTerms: alert.matched_terms,
      rationaleAr: alert.rationale_ar,
      excerpt: fieldCrypto.decrypt(alert.excerpt_enc, alert.child_id),
      status: alert.status === 'new' ? 'viewed' : alert.status,
      occurredAt: alert.occurred_at,
    });
  });

  /** PATCH /v1/alerts/:alertId  { status: 'resolved' | 'dismissed' | 'viewed' } */
  router.patch('/alerts/:alertId', async (req, res) => {
    const status = req.body?.status;
    if (!STATUSES.has(status)) throw new HttpError(400, 'Invalid status');

    const { rows } = await pool.query('SELECT child_id FROM alerts WHERE id = $1', [req.params.alertId]);
    if (!rows[0]) throw new HttpError(404, 'Alert not found');
    await assertParentCanAccessChild(req.parent.id, rows[0].child_id);

    const resolving = status === 'resolved' || status === 'dismissed';
    await pool.query(
      `UPDATE alerts SET status = $2,
              resolved_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END,
              resolved_at = CASE WHEN $3 THEN now() ELSE NULL END
        WHERE id = $1`,
      [req.params.alertId, status, resolving, req.parent.id],
    );
    res.json({ id: req.params.alertId, status });
  });

  /** GET /v1/children/:childId/location — latest fix and recent geofence events. Audited. */
  router.get('/children/:childId/location', async (req, res) => {
    const { childId } = req.params;
    await assertParentCanAccessChild(req.parent.id, childId);
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'location.view', childId, ip: req.ip });

    const [latest, events] = await Promise.all([
      pool.query(
        `SELECT lat, lng, accuracy_m AS "accuracyM", battery_pct AS "batteryPct", recorded_at AS "recordedAt"
           FROM location_points WHERE child_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
        [childId],
      ),
      pool.query(
        `SELECT e.event, e.occurred_at AS "occurredAt", g.name AS "placeName"
           FROM geofence_events e JOIN geofences g ON g.id = e.geofence_id
          WHERE e.child_id = $1 ORDER BY e.occurred_at DESC LIMIT 20`,
        [childId],
      ),
    ]);
    res.json({ latest: latest.rows[0] ?? null, recentEvents: events.rows });
  });

  return router;
}
