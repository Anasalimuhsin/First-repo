// Children, consent, device pairing and devices (parent-authenticated).

import crypto from 'node:crypto';
import { Router } from 'express';
import { pool, withTransaction } from '../lib/db.js';
import { assertParentCanAccessChild, familyOfParent, audit, HttpError } from '../lib/auth.js';
import { hashToken } from '../lib/fieldCrypto.js';
import { CONSENT_METHODS } from '../lib/consentVerifier.js';
import { parse, z, uuid } from '../lib/validate.js';

export const CONSENT_SCOPES = ['content_monitoring', 'location', 'screen_time', 'llm_analysis'];
export const CURRENT_POLICY_VERSION = process.env.PRIVACY_POLICY_VERSION || '2026-10';
const PAIRING_TTL_MINUTES = 10;
const ALERT_CATEGORIES = ['self_harm', 'bullying', 'grooming', 'violence', 'drugs', 'explicit_content'];

const thisYear = () => new Date().getUTCFullYear();

const ChildBody = z.object({
  displayName: z.string().trim().min(1).max(40),
  birthYear: z.number().int().refine((y) => y >= thisYear() - 18 && y <= thisYear() - 3, 'child must be 3–18 years old'),
});
const ChildPatch = ChildBody.partial();

const ConsentBody = z.object({
  scopes: z.array(z.enum(CONSENT_SCOPES)).min(1),
  method: z.enum(CONSENT_METHODS),
  verificationRef: z.string().max(200).optional(),
  policyVersion: z.literal(CURRENT_POLICY_VERSION, { message: `must accept the current policy (${CURRENT_POLICY_VERSION})` }),
  childNotified: z.boolean(),
});

/** router.param handler shared by parent routers: validates :childId and checks family access. */
export function childParam(req, _res, next, childId) {
  Promise.resolve()
    .then(async () => {
      parse(uuid, childId);
      req.childAccess = await assertParentCanAccessChild(req.parent.id, childId);
    })
    .then(() => next(), next);
}

export function childrenRouter({ consentVerifier }) {
  const router = Router();

  router.param('childId', childParam);

  /** GET /v1/children — with open alert counts and device counts. */
  router.get('/children', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ch.id, ch.display_name AS "displayName", ch.birth_year AS "birthYear",
              (SELECT count(*)::int FROM alerts a WHERE a.child_id = ch.id AND a.status = 'new') AS "newAlerts",
              (SELECT count(*)::int FROM devices d WHERE d.child_id = ch.id AND d.revoked_at IS NULL) AS "devices",
              COALESCE((SELECT array_agg(DISTINCT s) FROM consents c, unnest(c.scopes) s
                        WHERE c.child_id = ch.id AND c.revoked_at IS NULL), '{}') AS "scopes"
         FROM children ch
         JOIN family_members fm ON fm.family_id = ch.family_id
        WHERE fm.parent_id = $1 AND ch.deleted_at IS NULL
        ORDER BY ch.created_at`,
      [req.parent.id],
    );
    res.json({ children: rows });
  });

  router.post('/children', async (req, res) => {
    const body = parse(ChildBody, req.body);
    const { familyId } = await familyOfParent(req.parent.id);
    const { rows: [child] } = await pool.query(
      `INSERT INTO children (family_id, display_name, birth_year) VALUES ($1, $2, $3)
       RETURNING id, display_name AS "displayName", birth_year AS "birthYear"`,
      [familyId, body.displayName, body.birthYear],
    );
    // Sensible defaults: everything on, alert from "medium" (self-harm from "low").
    await pool.query(
      `INSERT INTO alert_settings (child_id, category, min_severity)
       SELECT $1, c::alert_category, CASE WHEN c = 'self_harm' THEN 'low' ELSE 'medium' END::alert_severity
         FROM unnest($2::text[]) c`,
      [child.id, ALERT_CATEGORIES],
    );
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'child.create', childId: child.id, ip: req.ip });
    res.status(201).json(child);
  });

  router.get('/children/:childId', async (req, res) => {
    const { rows: [child] } = await pool.query(
      `SELECT id, display_name AS "displayName", birth_year AS "birthYear", created_at AS "createdAt"
         FROM children WHERE id = $1`,
      [req.params.childId],
    );
    res.json(child);
  });

  router.patch('/children/:childId', async (req, res) => {
    const body = parse(ChildPatch, req.body);
    const { rows: [child] } = await pool.query(
      `UPDATE children SET display_name = COALESCE($2, display_name), birth_year = COALESCE($3, birth_year)
        WHERE id = $1 RETURNING id, display_name AS "displayName", birth_year AS "birthYear"`,
      [req.params.childId, body.displayName ?? null, body.birthYear ?? null],
    );
    res.json(child);
  });

  /** Hard delete: the child's alerts, locations, devices etc. cascade. Owner only. */
  router.delete('/children/:childId', async (req, res) => {
    if (req.childAccess.role !== 'owner') throw new HttpError(403, 'Only the family owner can delete a child');
    await pool.query('DELETE FROM children WHERE id = $1', [req.params.childId]);
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'child.delete', targetId: req.params.childId, ip: req.ip });
    res.status(204).end();
  });

  // ── Consent ──

  router.get('/children/:childId/consents', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, scopes, method, policy_version AS "policyVersion", child_notified AS "childNotified",
              granted_at AS "grantedAt", revoked_at AS "revokedAt"
         FROM consents WHERE child_id = $1 ORDER BY granted_at DESC`,
      [req.params.childId],
    );
    res.json({ consents: rows, currentPolicyVersion: CURRENT_POLICY_VERSION, availableScopes: CONSENT_SCOPES });
  });

  /**
   * Grant consent. Replaces any active consent for the child (so the scope
   * set is always exactly what the parent last agreed to).
   */
  router.post('/children/:childId/consents', async (req, res) => {
    const body = parse(ConsentBody, req.body);
    await consentVerifier.verify(body);
    const consent = await withTransaction(async (db) => {
      await db.query('UPDATE consents SET revoked_at = now() WHERE child_id = $1 AND revoked_at IS NULL', [req.params.childId]);
      const { rows: [row] } = await db.query(
        `INSERT INTO consents (child_id, parent_id, policy_version, scopes, method, verification_ref, child_notified)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, scopes, granted_at AS "grantedAt"`,
        [req.params.childId, req.parent.id, body.policyVersion, [...new Set(body.scopes)], body.method,
         body.verificationRef ?? null, body.childNotified],
      );
      await audit({ actorType: 'parent', actorId: req.parent.id, action: 'consent.grant',
                    childId: req.params.childId, targetId: row.id, ip: req.ip }, db);
      return row;
    });
    res.status(201).json(consent);
  });

  /** Revoke all consent: monitoring stops immediately (every device endpoint checks scopes). */
  router.delete('/children/:childId/consents', async (req, res) => {
    await pool.query('UPDATE consents SET revoked_at = now() WHERE child_id = $1 AND revoked_at IS NULL', [req.params.childId]);
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'consent.revoke', childId: req.params.childId, ip: req.ip });
    res.status(204).end();
  });

  // ── Pairing & devices ──

  /** Create a one-time 8-digit pairing code (shown as text + QR in the parent app). */
  router.post('/children/:childId/pairing-codes', async (req, res) => {
    const code = String(crypto.randomInt(0, 100_000_000)).padStart(8, '0');
    const { rows: [row] } = await pool.query(
      `INSERT INTO pairing_codes (child_id, created_by, code_hash, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4)) RETURNING expires_at AS "expiresAt"`,
      [req.params.childId, req.parent.id, hashToken(code), PAIRING_TTL_MINUTES],
    );
    res.status(201).json({ code, expiresAt: row.expiresAt });
  });

  router.get('/children/:childId/devices', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, platform, model, app_version AS "appVersion", enrolled_at AS "enrolledAt", last_seen_at AS "lastSeenAt"
         FROM devices WHERE child_id = $1 AND revoked_at IS NULL ORDER BY enrolled_at`,
      [req.params.childId],
    );
    res.json({ devices: rows });
  });

  router.delete('/children/:childId/devices/:deviceId', async (req, res) => {
    const { rowCount } = await pool.query(
      'UPDATE devices SET revoked_at = now() WHERE id = $1 AND child_id = $2 AND revoked_at IS NULL',
      [parse(uuid, req.params.deviceId), req.params.childId],
    );
    if (rowCount === 0) throw new HttpError(404, 'Device not found');
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'device.revoke',
                  childId: req.params.childId, targetId: req.params.deviceId, ip: req.ip });
    res.status(204).end();
  });

  return router;
}
