import { pool } from './db.js';
import { hashToken } from './fieldCrypto.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function bearer(req) {
  const header = req.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Missing bearer token');
  return token;
}

/** Authenticates the child's device. Sets req.device = { id, childId, scopes }. */
export async function requireDevice(req, _res, next) {
  const { rows } = await pool.query(
    `SELECT d.id, d.child_id,
            COALESCE((SELECT array_agg(DISTINCT s) FROM consents c, unnest(c.scopes) s
                      WHERE c.child_id = d.child_id AND c.revoked_at IS NULL), '{}') AS scopes
       FROM devices d
       JOIN children ch ON ch.id = d.child_id AND ch.deleted_at IS NULL
      WHERE d.token_hash = $1 AND d.revoked_at IS NULL`,
    [hashToken(bearer(req))],
  );
  if (!rows[0]) throw new HttpError(401, 'Unknown or revoked device');
  req.device = { id: rows[0].id, childId: rows[0].child_id, scopes: rows[0].scopes };
  await pool.query('UPDATE devices SET last_seen_at = now() WHERE id = $1', [req.device.id]);
  next();
}

/** Authenticates a parent session. Sets req.parent = { id }. */
export async function requireParent(req, _res, next) {
  const { rows } = await pool.query(
    `SELECT s.parent_id FROM parent_sessions s
       JOIN parents p ON p.id = s.parent_id AND p.deleted_at IS NULL
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [hashToken(bearer(req))],
  );
  if (!rows[0]) throw new HttpError(401, 'Invalid or expired session');
  req.parent = { id: rows[0].parent_id };
  next();
}

/** Throws 404 (not 403, to avoid leaking which ids exist) unless the parent belongs to the child's family. */
export async function assertParentCanAccessChild(parentId, childId) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM children ch
       JOIN family_members fm ON fm.family_id = ch.family_id
      WHERE ch.id = $1 AND fm.parent_id = $2 AND ch.deleted_at IS NULL`,
    [childId, parentId],
  );
  if (rowCount === 0) throw new HttpError(404, 'Child not found');
}

export function requireScope(scope) {
  return (req, _res, next) => {
    if (!req.device.scopes.includes(scope)) {
      throw new HttpError(403, `Parental consent does not cover "${scope}"`);
    }
    next();
  };
}

export async function audit({ actorType, actorId, action, childId, targetId = null, ip = null }) {
  await pool.query(
    `INSERT INTO audit_log (actor_type, actor_id, action, child_id, target_id, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorType, actorId, action, childId, targetId, ip],
  );
}

/** FCM tokens of every parent in the child's family with an active session. */
export async function parentPushTokens(childId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT s.push_token FROM children ch
       JOIN family_members fm ON fm.family_id = ch.family_id
       JOIN parent_sessions s ON s.parent_id = fm.parent_id
      WHERE ch.id = $1 AND s.push_token IS NOT NULL
        AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [childId],
  );
  return rows.map((r) => r.push_token);
}
