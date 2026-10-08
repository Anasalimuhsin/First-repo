import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skip, startApp } from './helpers.js';

describe('parent auth', { skip }, () => {
  let ctx;
  before(async () => { ctx = await startApp(); });
  after(async () => ctx?.close());

  const creds = { email: 'Mona@Example.com', password: 'a-strong-password', fullName: 'منى' };
  let token;

  test('signup creates parent + family and returns a session', async () => {
    const r = await ctx.call('POST', '/v1/auth/signup', { body: { ...creds, timezone: 'Asia/Dubai' } });
    assert.equal(r.status, 201);
    assert.ok(r.body.token);
    token = r.body.token;
    const me = await ctx.call('GET', '/v1/auth/me', { token });
    assert.equal(me.body.email, 'mona@example.com');
    assert.equal(me.body.role, 'owner');
    assert.equal(me.body.timezone, 'Asia/Dubai');
    assert.equal(me.body.mfaEnabled, false);
  });

  test('duplicate email (any case) is rejected', async () => {
    const r = await ctx.call('POST', '/v1/auth/signup', { body: { ...creds, email: 'MONA@example.com' } });
    assert.equal(r.status, 409);
  });

  test('validation: short password, bad email, bad time zone', async () => {
    assert.equal((await ctx.call('POST', '/v1/auth/signup', { body: { ...creds, email: 'x@y.com', password: 'short' } })).status, 400);
    assert.equal((await ctx.call('POST', '/v1/auth/signup', { body: { ...creds, email: 'nope' } })).status, 400);
    assert.equal((await ctx.call('POST', '/v1/auth/signup', { body: { ...creds, email: 'z@y.com', timezone: 'Mars/Base' } })).status, 400);
  });

  test('login: wrong password and unknown email both 401 with the same message', async () => {
    const a = await ctx.call('POST', '/v1/auth/login', { body: { email: creds.email, password: 'wrong-password' } });
    const b = await ctx.call('POST', '/v1/auth/login', { body: { email: 'ghost@example.com', password: 'wrong-password' } });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error, b.body.error);
  });

  test('MFA: setup, enable, then login requires a valid code', async () => {
    const { totpAt } = await import('../../src/lib/totp.js');
    const setup = await ctx.call('POST', '/v1/auth/mfa/setup', { token });
    assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//);
    assert.equal((await ctx.call('POST', '/v1/auth/mfa/enable', { token, body: { code: '000000' } })).status, 400);
    const enable = await ctx.call('POST', '/v1/auth/mfa/enable', { token, body: { code: totpAt(setup.body.secret) } });
    assert.equal(enable.body.mfaEnabled, true);

    const noCode = await ctx.call('POST', '/v1/auth/login', { body: { email: creds.email, password: creds.password } });
    assert.equal(noCode.status, 401);
    assert.match(noCode.body.error, /MFA code required/);
    const ok = await ctx.call('POST', '/v1/auth/login', { body: { email: creds.email, password: creds.password, totp: totpAt(setup.body.secret) } });
    assert.equal(ok.status, 200);

    // MFA secret is stored encrypted, never in plaintext.
    const { rows } = await ctx.pool.query('SELECT mfa_secret_enc FROM parents WHERE email = $1', ['mona@example.com']);
    assert.ok(!rows[0].mfa_secret_enc.includes(setup.body.secret));
  });

  test('push token registration and logout', async () => {
    assert.equal((await ctx.call('PUT', '/v1/auth/push-token', { token, body: { pushToken: 'ExponentPushToken[x]' } })).status, 204);
    assert.equal((await ctx.call('POST', '/v1/auth/logout', { token })).status, 204);
    assert.equal((await ctx.call('GET', '/v1/auth/me', { token })).status, 401);
  });

  test('malformed JSON is a 400, unknown route a 404', async () => {
    const res = await fetch(`${ctx.base}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    assert.equal(res.status, 400);
    assert.equal((await ctx.call('GET', '/nope')).status, 404);
  });

  test('security headers are set', async () => {
    const r = await ctx.call('GET', '/healthz');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-powered-by'), null);
  });
});
