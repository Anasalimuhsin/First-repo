// Parent accounts: signup, login (with optional TOTP), logout, MFA, push token.

import { Router } from 'express';
import { pool, withTransaction } from '../lib/db.js';
import { requireParent, createSession, audit, HttpError } from '../lib/auth.js';
import { hashPassword, verifyPassword, burnPasswordCheck, MIN_PASSWORD_LENGTH } from '../lib/passwords.js';
import { generateSecret, verifyTotp, otpauthUrl } from '../lib/totp.js';
import { parse, z } from '../lib/validate.js';

const email = z.email().max(254).transform((e) => e.toLowerCase());
const password = z.string().min(MIN_PASSWORD_LENGTH, `at least ${MIN_PASSWORD_LENGTH} characters`).max(200);
const timezone = z.string().max(64).refine((tz) => {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}, 'unknown time zone');

const SignupBody = z.object({
  email,
  password,
  fullName: z.string().trim().min(1).max(100),
  familyName: z.string().trim().min(1).max(100).optional(),
  timezone: timezone.optional(),
  locale: z.enum(['ar', 'en']).optional(),
});

const LoginBody = z.object({ email, password: z.string().max(200), totp: z.string().optional() });
const TotpBody = z.object({ code: z.string() });
const PushBody = z.object({ pushToken: z.string().max(4096).nullable() });

export function authRouter({ fieldCrypto, authLimiter }) {
  const router = Router();

  router.post('/signup', authLimiter, async (req, res) => {
    const body = parse(SignupBody, req.body);
    const passwordHash = await hashPassword(body.password);

    const result = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO parents (email, password_hash, full_name, locale) VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO NOTHING RETURNING id`,
        [body.email, passwordHash, body.fullName, body.locale ?? 'ar'],
      );
      if (!rows[0]) throw new HttpError(409, 'An account with this email already exists');
      const parentId = rows[0].id;
      const { rows: [family] } = await db.query(
        `INSERT INTO families (name, timezone) VALUES ($1, $2) RETURNING id`,
        [body.familyName ?? `عائلة ${body.fullName}`, body.timezone ?? 'Asia/Riyadh'],
      );
      await db.query(`INSERT INTO family_members (family_id, parent_id, role) VALUES ($1, $2, 'owner')`, [family.id, parentId]);
      await audit({ actorType: 'parent', actorId: parentId, action: 'account.create', ip: req.ip }, db);
      return { parentId, familyId: family.id, token: await createSession(db, parentId) };
    });

    res.status(201).json(result);
  });

  router.post('/login', authLimiter, async (req, res) => {
    const body = parse(LoginBody, req.body);
    const { rows } = await pool.query(
      `SELECT id, password_hash, mfa_enabled, mfa_secret_enc FROM parents WHERE email = $1 AND deleted_at IS NULL`,
      [body.email],
    );
    const parent = rows[0];
    if (!parent) {
      await burnPasswordCheck(body.password);
      throw new HttpError(401, 'Invalid email or password');
    }
    if (!(await verifyPassword(body.password, parent.password_hash))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    if (parent.mfa_enabled) {
      if (!body.totp) throw new HttpError(401, 'MFA code required');
      const secret = fieldCrypto.decrypt(parent.mfa_secret_enc, parent.id);
      if (!verifyTotp(secret, body.totp)) throw new HttpError(401, 'Invalid MFA code');
    }
    const token = await createSession(pool, parent.id);
    await audit({ actorType: 'parent', actorId: parent.id, action: 'session.create', ip: req.ip });
    res.json({ parentId: parent.id, token });
  });

  router.use(requireParent);

  router.post('/logout', async (req, res) => {
    await pool.query('UPDATE parent_sessions SET revoked_at = now() WHERE id = $1', [req.parent.sessionId]);
    res.status(204).end();
  });

  /** Revoke every session except the current one (e.g. after a lost phone). */
  router.post('/logout-others', async (req, res) => {
    const { rowCount } = await pool.query(
      'UPDATE parent_sessions SET revoked_at = now() WHERE parent_id = $1 AND id <> $2 AND revoked_at IS NULL',
      [req.parent.id, req.parent.sessionId],
    );
    res.json({ revoked: rowCount });
  });

  router.get('/me', async (req, res) => {
    const { rows: [me] } = await pool.query(
      `SELECT p.id, p.email, p.full_name AS "fullName", p.locale, p.mfa_enabled AS "mfaEnabled",
              f.id AS "familyId", f.name AS "familyName", f.timezone, fm.role
         FROM parents p
         JOIN family_members fm ON fm.parent_id = p.id
         JOIN families f ON f.id = fm.family_id
        WHERE p.id = $1 LIMIT 1`,
      [req.parent.id],
    );
    res.json(me);
  });

  /** Step 1: generate a secret (stored encrypted, not active yet). */
  router.post('/mfa/setup', async (req, res) => {
    const { rows: [p] } = await pool.query('SELECT email, mfa_enabled FROM parents WHERE id = $1', [req.parent.id]);
    if (p.mfa_enabled) throw new HttpError(409, 'MFA is already enabled');
    const secret = generateSecret();
    await pool.query('UPDATE parents SET mfa_secret_enc = $2 WHERE id = $1', [req.parent.id, fieldCrypto.encrypt(secret, req.parent.id)]);
    res.json({ secret, otpauthUrl: otpauthUrl(secret, p.email) });
  });

  /** Step 2: confirm a code from the authenticator app to activate MFA. */
  router.post('/mfa/enable', async (req, res) => {
    const { code } = parse(TotpBody, req.body);
    const { rows: [p] } = await pool.query('SELECT mfa_secret_enc FROM parents WHERE id = $1', [req.parent.id]);
    if (!p.mfa_secret_enc) throw new HttpError(400, 'Run MFA setup first');
    if (!verifyTotp(fieldCrypto.decrypt(p.mfa_secret_enc, req.parent.id), code)) throw new HttpError(400, 'Invalid code');
    await pool.query('UPDATE parents SET mfa_enabled = true WHERE id = $1', [req.parent.id]);
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'mfa.enable', ip: req.ip });
    res.json({ mfaEnabled: true });
  });

  router.post('/mfa/disable', async (req, res) => {
    const { code } = parse(TotpBody, req.body);
    const { rows: [p] } = await pool.query('SELECT mfa_enabled, mfa_secret_enc FROM parents WHERE id = $1', [req.parent.id]);
    if (!p.mfa_enabled) throw new HttpError(400, 'MFA is not enabled');
    if (!verifyTotp(fieldCrypto.decrypt(p.mfa_secret_enc, req.parent.id), code)) throw new HttpError(400, 'Invalid code');
    await pool.query('UPDATE parents SET mfa_enabled = false, mfa_secret_enc = NULL WHERE id = $1', [req.parent.id]);
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'mfa.disable', ip: req.ip });
    res.json({ mfaEnabled: false });
  });

  /** Register (or clear) the push token of the device this session runs on. */
  router.put('/push-token', async (req, res) => {
    const { pushToken } = parse(PushBody, req.body);
    await pool.query('UPDATE parent_sessions SET push_token = $2 WHERE id = $1', [req.parent.sessionId, pushToken]);
    res.status(204).end();
  });

  return router;
}
