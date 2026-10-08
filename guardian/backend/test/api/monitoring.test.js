import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skip, startApp, setupFamily } from './helpers.js';

const now = () => new Date().toISOString();
const msg = (text, extra = {}) => ({ source: 'instagram', direction: 'incoming', text, occurredAt: now(), ...extra });

describe('monitoring: messages, images, alerts, location, policy', { skip }, () => {
  let ctx;
  before(async () => { ctx = await startApp(); });
  after(async () => ctx?.close());

  test('messages → alert only for risky text; excerpt encrypted at rest; parent notified', async () => {
    const f = await setupFamily(ctx);
    ctx.notifications.length = 0;
    const r = await ctx.call('POST', '/v1/device/messages', {
      token: f.deviceToken, body: { items: [msg('محد يحبك روح موت'), msg('نتقابل بكرة نذاكر')] },
    });
    assert.deepEqual(r.body, { received: 2, alertsCreated: 1 });

    const { rows } = await ctx.pool.query('SELECT excerpt_enc FROM alerts WHERE child_id = $1', [f.childId]);
    assert.equal(rows.length, 1);
    assert.ok(!rows[0].excerpt_enc.includes('يحبك'));
    assert.equal(ctx.notifications.length, 1);
    assert.equal(ctx.notifications[0].category, 'bullying');
  });

  test('feed hides excerpts; detail decrypts, marks viewed and is audited; status changes', async () => {
    const f = await setupFamily(ctx);
    await ctx.call('POST', '/v1/device/messages', { token: f.deviceToken, body: { items: [msg('انت فاشل وكلنا نكرهك')] } });
    const feed = await ctx.call('GET', `/v1/children/${f.childId}/alerts`, { token: f.token });
    assert.equal(feed.body.alerts.length, 1);
    assert.equal(feed.body.alerts[0].excerpt, undefined);

    const id = feed.body.alerts[0].id;
    const detail = await ctx.call('GET', `/v1/alerts/${id}`, { token: f.token });
    assert.equal(detail.body.excerpt, 'انت فاشل وكلنا نكرهك');
    assert.equal(detail.body.status, 'viewed');
    assert.ok(detail.body.parentGuidanceAr);

    const audit = await ctx.pool.query(`SELECT 1 FROM audit_log WHERE action = 'alert.view' AND target_id = $1`, [id]);
    assert.equal(audit.rowCount, 1);

    assert.equal((await ctx.call('PATCH', `/v1/alerts/${id}`, { token: f.token, body: { status: 'resolved' } })).body.status, 'resolved');
    const open = await ctx.call('GET', `/v1/children/${f.childId}/alerts?status=new`, { token: f.token });
    assert.equal(open.body.alerts.length, 0);
    assert.equal((await ctx.call('GET', `/v1/children/${f.childId}/alerts?status=bogus`, { token: f.token })).status, 400);
  });

  test('alert settings: a raised threshold suppresses lower alerts; self-harm cannot be disabled', async () => {
    const f = await setupFamily(ctx);
    const put = (settings) => ctx.call('PUT', `/v1/children/${f.childId}/alert-settings`, { token: f.token, body: { settings } });
    assert.equal((await put([{ category: 'bullying', enabled: true, minSeverity: 'critical' }])).status, 200);
    assert.equal((await put([{ category: 'self_harm', enabled: false, minSeverity: 'low' }])).status, 400);

    const r = await ctx.call('POST', '/v1/device/messages', { token: f.deviceToken, body: { items: [msg('محد يحبك روح موت')] } });
    assert.equal(r.body.alertsCreated, 0);
  });

  test('message validation', async () => {
    const f = await setupFamily(ctx);
    const bad = await ctx.call('POST', '/v1/device/messages', { token: f.deviceToken, body: { items: [msg('x', { source: 'myspace' })] } });
    assert.equal(bad.status, 400);
    const tooMany = await ctx.call('POST', '/v1/device/messages', { token: f.deviceToken, body: { items: Array(101).fill(msg('x')) } });
    assert.equal(tooMany.status, 400);
  });

  test('image signals: only known labels over the threshold alert, image never stored', async () => {
    const f = await setupFamily(ctx);
    const r = await ctx.call('POST', '/v1/device/image-signals', {
      token: f.deviceToken,
      body: { items: [
        { source: 'snapchat', direction: 'incoming', occurredAt: now(), labels: [{ label: 'nudity', score: 0.95 }] },
        { source: 'snapchat', direction: 'incoming', occurredAt: now(), labels: [{ label: 'nudity', score: 0.4 }] },
        { source: 'snapchat', direction: 'incoming', occurredAt: now(), labels: [{ label: 'cat', score: 0.99 }] },
      ] },
    });
    assert.equal(r.body.alertsCreated, 1);
    const feed = await ctx.call('GET', `/v1/children/${f.childId}/alerts`, { token: f.token });
    assert.equal(feed.body.alerts[0].category, 'explicit_content');
    assert.equal(feed.body.alerts[0].severity, 'critical');
    const detail = await ctx.call('GET', `/v1/alerts/${feed.body.alerts[0].id}`, { token: f.token });
    assert.match(detail.body.excerpt, /^\[صورة\]/);
  });

  test('geofences CRUD + enter/exit events + location history', async () => {
    const f = await setupFamily(ctx);
    const created = await ctx.call('POST', `/v1/children/${f.childId}/geofences`, {
      token: f.token, body: { name: 'المدرسة', lat: 24.7136, lng: 46.6753, radiusM: 150 },
    });
    assert.equal(created.status, 201);
    assert.equal((await ctx.call('POST', `/v1/children/${f.childId}/geofences`, { token: f.token, body: { name: 'x', lat: 99, lng: 0, radiusM: 150 } })).status, 400);

    ctx.notifications.length = 0;
    const t0 = Date.now() - 3600_000;
    const r = await ctx.call('POST', '/v1/device/locations', {
      token: f.deviceToken,
      body: { points: [
        // deliberately out of order: the server sorts by time
        { lat: 24.7200, lng: 46.6753, accuracyM: 10, recordedAt: new Date(t0 + 60_000).toISOString() },
        { lat: 24.7137, lng: 46.6753, accuracyM: 10, recordedAt: new Date(t0).toISOString() },
      ] },
    });
    assert.equal(r.body.geofenceEvents, 2);
    assert.deepEqual(ctx.notifications.map((n) => n.event), ['enter', 'exit']);

    const loc = await ctx.call('GET', `/v1/children/${f.childId}/location`, { token: f.token });
    assert.equal(loc.body.latest.lat, 24.72);
    assert.deepEqual(loc.body.recentEvents.map((e) => e.event), ['exit', 'enter']);
    const hist = await ctx.call('GET', `/v1/children/${f.childId}/location/history?hours=2`, { token: f.token });
    assert.equal(hist.body.points.length, 2);

    const id = created.body.id;
    assert.equal((await ctx.call('PUT', `/v1/children/${f.childId}/geofences/${id}`, {
      token: f.token, body: { name: 'البيت', lat: 24.8, lng: 46.7, radiusM: 200, notifyExit: false },
    })).body.name, 'البيت');
    assert.equal((await ctx.call('DELETE', `/v1/children/${f.childId}/geofences/${id}`, { token: f.token })).status, 204);
  });

  test('policy: schedules, limits, family rules with child override', async () => {
    const f = await setupFamily(ctx);
    const sched = await ctx.call('POST', `/v1/children/${f.childId}/schedules`, {
      token: f.token, body: { name: 'وقت النوم', daysOfWeek: [4, 0, 1, 0], startsAt: '21:30', endsAt: '06:30', mode: 'block_internet' },
    });
    assert.equal(sched.status, 201);
    assert.deepEqual(sched.body.daysOfWeek, [0, 1, 4]);
    assert.equal((await ctx.call('POST', `/v1/children/${f.childId}/schedules`, {
      token: f.token, body: { name: 'x', daysOfWeek: [1], startsAt: '25:00', endsAt: '06:00', mode: 'block_internet' },
    })).status, 400);

    await ctx.call('PUT', `/v1/children/${f.childId}/daily-limits`, {
      token: f.token, body: { limits: [{ target: 'app', value: 'com.zhiliaoapp.musically', minutes: 60 }] },
    });
    await ctx.call('POST', '/v1/filter-rules', { token: f.token, body: { target: 'domain', value: 'WWW.Example.com', action: 'block' } });
    await ctx.call('POST', '/v1/filter-rules', { token: f.token, body: { target: 'domain', value: 'example.com', action: 'allow', childId: f.childId } });
    await ctx.call('POST', '/v1/filter-rules', { token: f.token, body: { target: 'web_category', value: 'adult', action: 'block' } });
    assert.equal((await ctx.call('POST', '/v1/filter-rules', { token: f.token, body: { target: 'domain', value: 'not a domain', action: 'block' } })).status, 400);

    const policy = await ctx.call('GET', '/v1/device/policy', { token: f.deviceToken });
    assert.equal(policy.body.timezone, 'Asia/Riyadh');
    assert.deepEqual(policy.body.schedules.map((s) => [s.startsAt, s.endsAt]), [['21:30', '06:30']]);
    assert.deepEqual(policy.body.dailyLimits, [{ target: 'app', value: 'com.zhiliaoapp.musically', minutes: 60 }]);
    const exampleRule = policy.body.filterRules.find((r) => r.value === 'example.com');
    assert.equal(exampleRule.action, 'allow', 'child-specific rule overrides family rule');
    assert.ok(policy.body.filterRules.some((r) => r.target === 'web_category' && r.value === 'adult'));

    const rules = await ctx.call('GET', '/v1/filter-rules', { token: f.token });
    assert.equal(rules.body.rules.length, 3);
    assert.equal((await ctx.call('DELETE', `/v1/filter-rules/${rules.body.rules[0].id}`, { token: f.token })).status, 204);
  });
});
