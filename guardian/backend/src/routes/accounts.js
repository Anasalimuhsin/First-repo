// Linked online accounts (Gmail for the MVP).

import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../lib/db.js';
import { audit, HttpError } from '../lib/auth.js';
import { hashToken } from '../lib/fieldCrypto.js';
import { gmailConfig, authorizationUrl, exchangeCode, getProfile, revokeToken } from '../lib/gmail.js';
import { parse, z, uuid } from '../lib/validate.js';
import { childParam } from './children.js';

const STATE_TTL_MINUTES = 10;

/** Parent-authenticated routes. */
export function accountsRouter({ fieldCrypto, fetchImpl = fetch }) {
  const router = Router();
  router.param('childId', childParam);

  router.get('/children/:childId/accounts', async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, provider, source, connected_at AS "connectedAt", last_synced_at AS "lastSyncedAt",
              last_error AS "lastError", disconnected_at AS "disconnectedAt"
         FROM monitored_accounts WHERE child_id = $1 ORDER BY connected_at DESC`,
      [req.params.childId],
    );
    res.json({ accounts: rows, gmailAvailable: Boolean(gmailConfig()) });
  });

  /** Start the Gmail OAuth flow; the client opens the returned URL. */
  router.post('/children/:childId/accounts/gmail', async (req, res) => {
    const config = gmailConfig();
    if (!config) throw new HttpError(503, 'Gmail integration is not configured');
    const state = crypto.randomBytes(24).toString('base64url');
    await pool.query(
      `INSERT INTO oauth_states (state_hash, parent_id, child_id, provider, expires_at)
       VALUES ($1, $2, $3, 'gmail', now() + make_interval(mins => $4))`,
      [hashToken(state), req.parent.id, req.params.childId, STATE_TTL_MINUTES],
    );
    res.status(201).json({ authorizationUrl: authorizationUrl(config, state) });
  });

  router.delete('/children/:childId/accounts/:accountId', async (req, res) => {
    const { rows } = await pool.query(
      `UPDATE monitored_accounts SET disconnected_at = now()
        WHERE id = $1 AND child_id = $2 AND disconnected_at IS NULL
        RETURNING oauth_tokens_enc, child_id`,
      [parse(uuid, req.params.accountId), req.params.childId],
    );
    if (!rows[0]) throw new HttpError(404, 'Account not found');
    const tokens = JSON.parse(fieldCrypto.decrypt(rows[0].oauth_tokens_enc, rows[0].child_id));
    await revokeToken(tokens.refreshToken, fetchImpl);
    await pool.query('UPDATE monitored_accounts SET oauth_tokens_enc = NULL WHERE id = $1', [req.params.accountId]);
    await audit({ actorType: 'parent', actorId: req.parent.id, action: 'account.disconnect',
                  childId: req.params.childId, targetId: req.params.accountId, ip: req.ip });
    res.status(204).end();
  });

  return router;
}

/**
 * GET /v1/oauth/gmail/callback — browser redirect from Google (no bearer token;
 * the single-use state ties it to the parent and child).
 */
export function oauthCallbackRouter({ fieldCrypto, webAppUrl, fetchImpl = fetch }) {
  const router = Router();
  const Query = z.object({ state: z.string().min(10), code: z.string().optional(), error: z.string().optional() });

  router.get('/gmail/callback', async (req, res) => {
    const q = parse(Query, req.query);
    const { rows } = await pool.query(
      `DELETE FROM oauth_states WHERE state_hash = $1 AND provider = 'gmail' AND expires_at > now()
       RETURNING parent_id, child_id`,
      [hashToken(q.state)],
    );
    if (!rows[0]) throw new HttpError(400, 'Invalid or expired state');
    const { parent_id: parentId, child_id: childId } = rows[0];
    const back = (status) => res.redirect(303, `${webAppUrl}/children/${childId}?gmail=${status}`);
    if (q.error || !q.code) return back('denied');

    const config = gmailConfig();
    const tokens = await exchangeCode(config, q.code, fetchImpl);
    if (!tokens.refreshToken) return back('no_refresh_token');
    const profile = await getProfile(tokens.accessToken, fetchImpl);

    await pool.query(
      `INSERT INTO monitored_accounts (child_id, source, provider, handle_hash, oauth_tokens_enc)
       VALUES ($1, 'email', 'gmail', $2, $3)
       ON CONFLICT (child_id, provider, handle_hash) DO UPDATE
         SET oauth_tokens_enc = EXCLUDED.oauth_tokens_enc, disconnected_at = NULL, last_error = NULL, connected_at = now()`,
      [childId, hashToken(profile.emailAddress.toLowerCase()), fieldCrypto.encrypt(JSON.stringify(tokens), childId)],
    );
    await audit({ actorType: 'parent', actorId: parentId, action: 'account.connect', childId, ip: req.ip });
    back('connected');
  });

  return router;
}
