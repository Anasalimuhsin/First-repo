// Polls connected Gmail accounts and analyses new messages.
// Messages are analysed in memory; only alerts are stored (see services/alerts.js).

import { pool } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import {
  gmailConfig, refreshAccessToken, listMessageIdsSince, getMessage, messageToItem, GmailAuthError,
} from '../lib/gmail.js';
import { processTextItems } from '../services/alerts.js';

const FIRST_SYNC_LOOKBACK_MS = 24 * 3600 * 1000;

export async function syncGmailAccount(account, { config, fieldCrypto, notifier, classify, fetchImpl = fetch }) {
  let tokens = JSON.parse(fieldCrypto.decrypt(account.oauth_tokens_enc, account.child_id));
  const refreshed = await refreshAccessToken(config, tokens, fetchImpl);
  if (refreshed !== tokens) {
    tokens = refreshed;
    await pool.query('UPDATE monitored_accounts SET oauth_tokens_enc = $2 WHERE id = $1',
      [account.id, fieldCrypto.encrypt(JSON.stringify(tokens), account.child_id)]);
  }

  const cursor = Number(account.sync_cursor) || Date.now() - FIRST_SYNC_LOOKBACK_MS;
  const ids = await listMessageIdsSince(tokens.accessToken, cursor, fetchImpl);
  const items = [];
  for (const id of ids) {
    const item = messageToItem(await getMessage(tokens.accessToken, id, fetchImpl));
    // after: has 1-second granularity; skip what the cursor already covered.
    if (item.internalDate > cursor) items.push(item);
  }

  const created = items.length
    ? await processTextItems({ childId: account.child_id, items, scopes: account.scopes, classify, fieldCrypto, notifier })
    : [];
  const newCursor = Math.max(cursor, ...items.map((i) => i.internalDate));
  await pool.query(
    `UPDATE monitored_accounts SET sync_cursor = $2, last_synced_at = now(), last_error = NULL WHERE id = $1`,
    [account.id, String(newCursor)],
  );
  return { scanned: items.length, alerts: created.length };
}

/** Sync every active Gmail account whose child has content_monitoring consent. */
export async function syncAllGmail(deps) {
  const config = gmailConfig();
  if (!config) return { skipped: 'gmail not configured' };

  const { rows: accounts } = await pool.query(
    `SELECT m.*, COALESCE((SELECT array_agg(DISTINCT s) FROM consents c, unnest(c.scopes) s
                           WHERE c.child_id = m.child_id AND c.revoked_at IS NULL), '{}') AS scopes
       FROM monitored_accounts m
       JOIN children ch ON ch.id = m.child_id AND ch.deleted_at IS NULL
      WHERE m.provider = 'gmail' AND m.disconnected_at IS NULL`,
  );

  const summary = { accounts: 0, scanned: 0, alerts: 0, errors: 0 };
  for (const account of accounts) {
    if (!account.scopes.includes('content_monitoring')) continue;
    try {
      const r = await syncGmailAccount(account, { ...deps, config });
      summary.accounts += 1;
      summary.scanned += r.scanned;
      summary.alerts += r.alerts;
    } catch (error) {
      summary.errors += 1;
      const revoked = error instanceof GmailAuthError;
      logger.warn({ accountId: account.id, err: error.message }, 'gmail sync failed');
      await pool.query(
        `UPDATE monitored_accounts SET last_error = $2,
                disconnected_at = CASE WHEN $3 THEN now() ELSE disconnected_at END WHERE id = $1`,
        [account.id, error.message.slice(0, 500), revoked],
      );
    }
  }
  return summary;
}
