// Parent data rights: export everything we hold, delete the account.

import { Router } from 'express';
import { pool, withTransaction } from '../lib/db.js';
import { audit, HttpError } from '../lib/auth.js';
import { verifyPassword } from '../lib/passwords.js';
import { parse, z } from '../lib/validate.js';

const DeleteBody = z.object({ password: z.string().max(200) });

export function privacyRouter({ fieldCrypto }) {
  const router = Router();

  /** GET /v1/me/export — machine-readable export of all data about the family. */
  router.get('/me/export', async (req, res) => {
    const q = (sql, params = [req.parent.id]) => pool.query(sql, params).then((r) => r.rows);
    const familyIds = (await q('SELECT family_id FROM family_members WHERE parent_id = $1')).map((r) => r.family_id);
    const children = await q('SELECT * FROM children WHERE family_id = ANY($1)', [familyIds]);
    const childIds = children.map((c) => c.id);
    const byChild = (sql) => q(sql, [childIds]);

    const alerts = (await byChild('SELECT * FROM alerts WHERE child_id = ANY($1) ORDER BY created_at')).map(
      ({ excerpt_enc: enc, ...a }) => ({ ...a, excerpt: fieldCrypto.decrypt(enc, a.child_id) }),
    );

    const exported = {
      exportedAt: new Date().toISOString(),
      parent: (await q('SELECT id, email, full_name, locale, mfa_enabled, created_at FROM parents WHERE id = $1'))[0],
      families: await q('SELECT * FROM families WHERE id = ANY($1)', [familyIds]),
      children,
      consents: await byChild('SELECT id, child_id, parent_id, policy_version, scopes, method, child_notified, granted_at, revoked_at FROM consents WHERE child_id = ANY($1)'),
      devices: await byChild('SELECT id, child_id, platform, model, app_version, enrolled_at, last_seen_at, revoked_at FROM devices WHERE child_id = ANY($1)'),
      linkedAccounts: await byChild('SELECT id, child_id, provider, connected_at, disconnected_at, last_synced_at FROM monitored_accounts WHERE child_id = ANY($1)'),
      alertSettings: await byChild('SELECT * FROM alert_settings WHERE child_id = ANY($1)'),
      alerts,
      geofences: await byChild('SELECT * FROM geofences WHERE child_id = ANY($1)'),
      geofenceEvents: await byChild('SELECT * FROM geofence_events WHERE child_id = ANY($1)'),
      locationPoints: await byChild('SELECT lat, lng, accuracy_m, battery_pct, recorded_at, child_id FROM location_points WHERE child_id = ANY($1) ORDER BY recorded_at'),
      schedules: await byChild('SELECT * FROM screen_time_schedules WHERE child_id = ANY($1)'),
      dailyLimits: await byChild('SELECT * FROM daily_limits WHERE child_id = ANY($1)'),
      filterRules: await q('SELECT * FROM filter_rules WHERE family_id = ANY($1)', [familyIds]),
      auditLog: await q('SELECT action, child_id, target_id, at FROM audit_log WHERE actor_id = $1 ORDER BY at'),
    };
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'data.export', ip: req.ip });
    res.set('content-disposition', 'attachment; filename="guardian-export.json"').json(exported);
  });

  /**
   * DELETE /v1/me  { password }
   * Owner: deletes the whole family (children and all their data cascade).
   * Guardian: leaves the family. In both cases the parent record is
   * anonymised (kept only so audit/consent foreign keys stay valid).
   */
  router.delete('/me', async (req, res) => {
    const { password } = parse(DeleteBody, req.body);
    const { rows: [p] } = await pool.query('SELECT password_hash FROM parents WHERE id = $1', [req.parent.id]);
    if (!(await verifyPassword(password, p.password_hash))) throw new HttpError(401, 'Wrong password');

    await withTransaction(async (db) => {
      const { rows: memberships } = await db.query('SELECT family_id, role FROM family_members WHERE parent_id = $1', [req.parent.id]);
      for (const m of memberships) {
        if (m.role === 'owner') await db.query('DELETE FROM families WHERE id = $1', [m.family_id]);
        else await db.query('DELETE FROM family_members WHERE family_id = $1 AND parent_id = $2', [m.family_id, req.parent.id]);
      }
      await db.query('UPDATE parent_sessions SET revoked_at = now(), push_token = NULL WHERE parent_id = $1', [req.parent.id]);
      await db.query(
        `UPDATE parents SET email = 'deleted+' || id || '@invalid', full_name = 'deleted', password_hash = '!',
                mfa_secret_enc = NULL, mfa_enabled = false, deleted_at = now() WHERE id = $1`,
        [req.parent.id],
      );
      await audit({ actorType: 'parent', actorId: req.parent.id, action: 'account.delete', ip: req.ip }, db);
    });
    res.status(204).end();
  });

  return router;
}
