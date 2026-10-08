import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skip, startApp, setupFamily } from './helpers.js';

describe('children, consent, pairing, isolation', { skip }, () => {
  let ctx;
  before(async () => { ctx = await startApp(); });
  after(async () => ctx?.close());

  test('child validation', async () => {
    const { token } = await setupFamily(ctx);
    const r = await ctx.call('POST', '/v1/children', { token, body: { displayName: 'x', birthYear: 1990 } });
    assert.equal(r.status, 400);
  });

  test('new child gets default alert settings (self-harm from low)', async () => {
    const f = await setupFamily(ctx);
    const r = await ctx.call('GET', `/v1/children/${f.childId}/alert-settings`, { token: f.token });
    const selfHarm = r.body.settings.find((s) => s.category === 'self_harm');
    assert.equal(selfHarm.minSeverity, 'low');
    assert.equal(r.body.settings.length, 6);
  });

  test('pairing gives a working device token; codes are single-use', async () => {
    const f = await setupFamily(ctx);
    const me = await ctx.call('GET', '/v1/device/me', { token: f.deviceToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.displayName, 'سارة');
    assert.deepEqual(me.body.scopes.sort(), ['content_monitoring', 'location', 'screen_time']);

    const code = (await ctx.call('POST', `/v1/children/${f.childId}/pairing-codes`, { token: f.token })).body.code;
    assert.match(code, /^\d{8}$/);
    assert.equal((await ctx.call('POST', '/v1/device/pair', { body: { code, platform: 'android' } })).status, 201);
    assert.equal((await ctx.call('POST', '/v1/device/pair', { body: { code, platform: 'android' } })).status, 400);

    const devices = await ctx.call('GET', `/v1/children/${f.childId}/devices`, { token: f.token });
    assert.equal(devices.body.devices.length, 2);
  });

  test('expired pairing code is rejected', async () => {
    const f = await setupFamily(ctx);
    const code = (await ctx.call('POST', `/v1/children/${f.childId}/pairing-codes`, { token: f.token })).body.code;
    await ctx.pool.query(`UPDATE pairing_codes SET expires_at = now() - interval '1 second' WHERE used_at IS NULL`);
    assert.equal((await ctx.call('POST', '/v1/device/pair', { body: { code, platform: 'ios' } })).status, 400);
  });

  test('revoking a device locks it out', async () => {
    const f = await setupFamily(ctx);
    assert.equal((await ctx.call('DELETE', `/v1/children/${f.childId}/devices/${f.deviceId}`, { token: f.token })).status, 204);
    assert.equal((await ctx.call('GET', '/v1/device/me', { token: f.deviceToken })).status, 401);
  });

  test('consent: wrong policy version rejected; replacing scopes; revoking stops monitoring', async () => {
    const f = await setupFamily(ctx);
    const bad = await ctx.call('POST', `/v1/children/${f.childId}/consents`, {
      token: f.token, body: { scopes: ['location'], method: 'dev_attestation', policyVersion: '2020-01', childNotified: true },
    });
    assert.equal(bad.status, 400);

    await ctx.call('POST', `/v1/children/${f.childId}/consents`, {
      token: f.token, body: { scopes: ['location'], method: 'dev_attestation', policyVersion: '2026-10', childNotified: true },
    });
    const msg = { items: [{ source: 'sms', direction: 'incoming', text: 'hi', occurredAt: new Date().toISOString() }] };
    assert.equal((await ctx.call('POST', '/v1/device/messages', { token: f.deviceToken, body: msg })).status, 403);

    assert.equal((await ctx.call('DELETE', `/v1/children/${f.childId}/consents`, { token: f.token })).status, 204);
    const loc = { points: [{ lat: 24.7, lng: 46.6, recordedAt: new Date().toISOString() }] };
    assert.equal((await ctx.call('POST', '/v1/device/locations', { token: f.deviceToken, body: loc })).status, 403);

    const history = await ctx.call('GET', `/v1/children/${f.childId}/consents`, { token: f.token });
    assert.equal(history.body.consents.length, 2);
    assert.ok(history.body.consents.every((c) => c.revokedAt));
  });

  test('another family cannot see or touch the child (404, not 403)', async () => {
    const a = await setupFamily(ctx);
    const b = await setupFamily(ctx);
    for (const [method, url] of [
      ['GET', `/v1/children/${a.childId}`],
      ['GET', `/v1/children/${a.childId}/alerts`],
      ['GET', `/v1/children/${a.childId}/location`],
      ['POST', `/v1/children/${a.childId}/pairing-codes`],
      ['DELETE', `/v1/children/${a.childId}`],
    ]) {
      assert.equal((await ctx.call(method, url, { token: b.token })).status, 404, `${method} ${url}`);
    }
    const list = await ctx.call('GET', '/v1/children', { token: b.token });
    assert.ok(list.body.children.every((c) => c.id !== a.childId));
    assert.equal((await ctx.call('GET', '/v1/children/not-a-uuid', { token: b.token })).status, 400);
  });

  test('a device token cannot call parent endpoints', async () => {
    const f = await setupFamily(ctx);
    assert.equal((await ctx.call('GET', '/v1/children', { token: f.deviceToken })).status, 401);
  });

  test('deleting a child cascades its data', async () => {
    const f = await setupFamily(ctx);
    await ctx.call('POST', '/v1/device/messages', {
      token: f.deviceToken,
      body: { items: [{ source: 'sms', direction: 'incoming', text: 'روح موت محد يحبك', occurredAt: new Date().toISOString() }] },
    });
    assert.equal((await ctx.call('DELETE', `/v1/children/${f.childId}`, { token: f.token })).status, 204);
    const { rows } = await ctx.pool.query('SELECT count(*)::int AS n FROM alerts WHERE child_id = $1', [f.childId]);
    assert.equal(rows[0].n, 0);
  });
});
