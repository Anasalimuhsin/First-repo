// Alerts and location for parents.

import { Router } from 'express';
import { pool } from '../lib/db.js';
import { assertParentCanAccessChild, audit, HttpError } from '../lib/auth.js';
import { parse, z, uuid } from '../lib/validate.js';
import { CATEGORIES } from '../analyzer/lexicon.js';
import { childParam } from './children.js';

const ListQuery = z.object({
  status: z.enum(['new', 'viewed', 'resolved', 'dismissed']).optional(),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const PatchBody = z.object({ status: z.enum(['viewed', 'resolved', 'dismissed']) });
const HistoryQuery = z.object({ hours: z.coerce.number().int().min(1).max(24 * 7).default(24) });

const IMAGE_GUIDANCE_AR =
  'لا تفتح موضوع الصورة بأسلوب اتهام. اسأل طفلك عمّن أرسلها، وإذا كانت من شخص بالغ فاحتفظ بالأدلة وأبلغ الجهات المختصة.';

async function loadAlert(parentId, alertId) {
  const { rows } = await pool.query('SELECT * FROM alerts WHERE id = $1', [parse(uuid, alertId)]);
  if (!rows[0]) throw new HttpError(404, 'Alert not found');
  await assertParentCanAccessChild(parentId, rows[0].child_id);
  return rows[0];
}

export function alertsRouter({ fieldCrypto }) {
  const router = Router();
  router.param('childId', childParam);

  /** Feed without excerpts. */
  router.get('/children/:childId/alerts', async (req, res) => {
    const q = parse(ListQuery, req.query);
    const { rows } = await pool.query(
      `SELECT id, source, direction, category, severity, confidence, rationale_ar AS "rationaleAr",
              status, occurred_at AS "occurredAt", created_at AS "createdAt"
         FROM alerts
        WHERE child_id = $1 AND created_at < $2 AND ($3::alert_status IS NULL OR status = $3)
        ORDER BY created_at DESC
        LIMIT $4`,
      [req.params.childId, q.before ?? new Date(), q.status ?? null, q.limit],
    );
    res.json({ alerts: rows });
  });

  /** Full alert including the decrypted excerpt. Audited. */
  router.get('/alerts/:alertId', async (req, res) => {
    const alert = await loadAlert(req.parent.id, req.params.alertId);
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'alert.view',
                  childId: alert.child_id, targetId: alert.id, ip: req.ip });
    if (alert.status === 'new') {
      await pool.query(`UPDATE alerts SET status = 'viewed' WHERE id = $1 AND status = 'new'`, [alert.id]);
    }
    const category = CATEGORIES[alert.category];
    res.json({
      id: alert.id,
      childId: alert.child_id,
      source: alert.source,
      direction: alert.direction,
      category: alert.category,
      labelAr: category?.labelAr ?? (alert.category === 'explicit_content' ? 'محتوى غير لائق' : alert.category),
      parentGuidanceAr: category?.parentGuidanceAr ?? IMAGE_GUIDANCE_AR,
      severity: alert.severity,
      confidence: alert.confidence,
      detector: alert.detector,
      matchedTerms: alert.matched_terms,
      rationaleAr: alert.rationale_ar,
      excerpt: fieldCrypto.decrypt(alert.excerpt_enc, alert.child_id),
      status: alert.status === 'new' ? 'viewed' : alert.status,
      occurredAt: alert.occurred_at,
      createdAt: alert.created_at,
    });
  });

  router.patch('/alerts/:alertId', async (req, res) => {
    const { status } = parse(PatchBody, req.body);
    const alert = await loadAlert(req.parent.id, req.params.alertId);
    const resolving = status === 'resolved' || status === 'dismissed';
    await pool.query(
      `UPDATE alerts SET status = $2,
              resolved_by = CASE WHEN $3 THEN $4::uuid ELSE NULL END,
              resolved_at = CASE WHEN $3 THEN now() ELSE NULL END
        WHERE id = $1`,
      [alert.id, status, resolving, req.parent.id],
    );
    await audit({ actorType: 'parent', actorId: req.parent.id, action: `alert.${status}`,
                  childId: alert.child_id, targetId: alert.id, ip: req.ip });
    res.json({ id: alert.id, status });
  });

  /** Latest fix and recent geofence events. Audited. */
  router.get('/children/:childId/location', async (req, res) => {
    const { childId } = req.params;
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

  /** Location trail for the last N hours (max 7 days). Audited. */
  router.get('/children/:childId/location/history', async (req, res) => {
    const { hours } = parse(HistoryQuery, req.query);
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'location.history', childId: req.params.childId, ip: req.ip });
    const { rows } = await pool.query(
      `SELECT lat, lng, accuracy_m AS "accuracyM", recorded_at AS "recordedAt"
         FROM location_points
        WHERE child_id = $1 AND recorded_at > now() - make_interval(hours => $2)
        ORDER BY recorded_at`,
      [req.params.childId, hours],
    );
    res.json({ points: rows });
  });

  return router;
}
