import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skip, startApp, setupFamily } from './helpers.js';

const b64 = (s) => Buffer.from(s).toString('base64url');

// Fake Google: token exchange, profile, message list and message bodies.
function fakeGoogle() {
  const state = { revoked: [], invalidGrant: false, messages: [] };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
  state.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://oauth2.googleapis.com/token')) {
      const params = new URLSearchParams(init.body);
      if (params.get('grant_type') === 'refresh_token' && state.invalidGrant) return json({ error: 'invalid_grant' }, 400);
      return json({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600 });
    }
    if (u.startsWith('https://oauth2.googleapis.com/revoke')) { state.revoked.push(u); return json({}); }
    if (u.endsWith('/users/me/profile')) return json({ emailAddress: 'Kid@gmail.com' });
    if (u.includes('/users/me/messages?')) return json({ messages: state.messages.map((m) => ({ id: m.id })) });
    const m = u.match(/\/users\/me\/messages\/([^?]+)/);
    if (m) return json(state.messages.find((x) => x.id === m[1]));
    throw new Error(`unexpected fetch ${u}`);
  };
  return state;
}

describe('gmail integration, data export, account deletion, retention', { skip }, () => {
  let ctx;
  const google = fakeGoogle();
  before(async () => { ctx = await startApp({ fetchImpl: google.fetch }); });
  after(async () => ctx?.close());

  test('connect flow: state is single-use, tokens stored encrypted; sync creates alerts', async () => {
    const f = await setupFamily(ctx);
    const start = await ctx.call('POST', `/v1/children/${f.childId}/accounts/gmail`, { token: f.token });
    const state = new URL(start.body.authorizationUrl).searchParams.get('state');

    const cb = await ctx.call('GET', `/v1/oauth/gmail/callback?state=${state}&code=abc`);
    assert.equal(cb.status, 303);
    assert.equal(cb.headers.get('location'), `http://web.test/children/${f.childId}?gmail=connected`);
    assert.equal((await ctx.call('GET', `/v1/oauth/gmail/callback?state=${state}&code=abc`)).status, 400);

    const { rows: [acc] } = await ctx.pool.query('SELECT * FROM monitored_accounts WHERE child_id = $1', [f.childId]);
    assert.ok(!acc.oauth_tokens_enc.includes('refresh-1'));
    assert.ok(!acc.handle_hash.includes('kid'));

    const t = Date.now();
    google.messages = [
      { id: 'm1', internalDate: String(t), labelIds: ['INBOX'], payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'hi' }], body: { data: b64("don't tell your parents, send me a pic") } } },
      { id: 'm2', internalDate: String(t + 1), labelIds: ['INBOX'], payload: { mimeType: 'text/plain', headers: [], body: { data: b64('homework is due friday') } } },
    ];
    const { syncAllGmail } = await import('../../src/jobs/gmailSync.js');
    const summary = await syncAllGmail({ fieldCrypto: ctx.fieldCrypto, notifier: ctx.notifier, classify: null, fetchImpl: google.fetch });
    assert.deepEqual(summary, { accounts: 1, scanned: 2, alerts: 1, errors: 0 });

    // Second run: cursor means nothing is re-processed.
    const again = await syncAllGmail({ fieldCrypto: ctx.fieldCrypto, notifier: ctx.notifier, classify: null, fetchImpl: google.fetch });
    assert.equal(again.scanned, 0);

    const feed = await ctx.call('GET', `/v1/children/${f.childId}/alerts`, { token: f.token });
    assert.equal(feed.body.alerts[0].category, 'grooming');
    assert.equal(feed.body.alerts[0].source, 'email');

    // Revoked refresh token → account marked disconnected.
    google.invalidGrant = true;
    await ctx.pool.query(`UPDATE monitored_accounts SET oauth_tokens_enc = $2 WHERE id = $1`,
      [acc.id, ctx.fieldCrypto.encrypt(JSON.stringify({ refreshToken: 'refresh-1', accessToken: 'x', expiresAt: 0 }), f.childId)]);
    const failed = await syncAllGmail({ fieldCrypto: ctx.fieldCrypto, notifier: ctx.notifier, classify: null, fetchImpl: google.fetch });
    assert.equal(failed.errors, 1);
    const list = await ctx.call('GET', `/v1/children/${f.childId}/accounts`, { token: f.token });
    assert.ok(list.body.accounts[0].disconnectedAt);
    google.invalidGrant = false;
  });

  test('disconnect revokes the Google token', async () => {
    const f = await setupFamily(ctx);
    const start = await ctx.call('POST', `/v1/children/${f.childId}/accounts/gmail`, { token: f.token });
    await ctx.call('GET', `/v1/oauth/gmail/callback?state=${new URL(start.body.authorizationUrl).searchParams.get('state')}&code=abc`);
    const list = await ctx.call('GET', `/v1/children/${f.childId}/accounts`, { token: f.token });
    google.revoked.length = 0;
    assert.equal((await ctx.call('DELETE', `/v1/children/${f.childId}/accounts/${list.body.accounts[0].id}`, { token: f.token })).status, 204);
    assert.equal(google.revoked.length, 1);
  });

  test('export contains decrypted alerts; deletion needs password and removes the family', async () => {
    const f = await setupFamily(ctx);
    await ctx.call('POST', '/v1/device/messages', {
      token: f.deviceToken,
      body: { items: [{ source: 'sms', direction: 'incoming', text: 'روح موت محد يحبك', occurredAt: new Date().toISOString() }] },
    });
    const exp = await ctx.call('GET', '/v1/me/export', { token: f.token });
    assert.equal(exp.status, 200);
    assert.match(exp.headers.get('content-disposition'), /attachment/);
    assert.equal(exp.body.alerts[0].excerpt, 'روح موت محد يحبك');
    assert.equal(exp.body.children.length, 1);
    assert.equal(exp.body.parent.password_hash, undefined);

    assert.equal((await ctx.call('DELETE', '/v1/me', { token: f.token, body: { password: 'nope-nope-nope' } })).status, 401);
    assert.equal((await ctx.call('DELETE', '/v1/me', { token: f.token, body: { password: 'long-password-1' } })).status, 204);

    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM children WHERE id = $1', [f.childId]);
    assert.equal(rows[0].n, 0);
    assert.equal((await ctx.call('GET', '/v1/device/me', { token: f.deviceToken })).status, 401);
    assert.equal((await ctx.call('POST', '/v1/auth/login', { body: { email: f.email, password: 'long-password-1' } })).status, 401);
  });

  test('retention job deletes only expired rows', async () => {
    const f = await setupFamily(ctx);
    await ctx.call('POST', '/v1/device/locations', { token: f.deviceToken, body: { points: [
      { lat: 1, lng: 1, recordedAt: new Date().toISOString() },
      { lat: 2, lng: 2, recordedAt: new Date().toISOString() },
    ] } });
    await ctx.pool.query(`UPDATE location_points SET expires_at = now() - interval '1 minute' WHERE child_id = $1 AND lat = 1`, [f.childId]);
    const { runRetention } = await import('../../src/jobs/retention.js');
    const deleted = await runRetention();
    assert.equal(deleted.locationPoints, 1);
    const { rows } = await ctx.pool.query('SELECT lat FROM location_points WHERE child_id = $1', [f.childId]);
    assert.deepEqual(rows.map((r) => r.lat), [2]);
  });
});
