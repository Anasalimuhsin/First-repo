import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { skip, startApp, setupFamily } from './helpers.js';

const item = (text) => ({ source: 'whatsapp', direction: 'incoming', text, occurredAt: new Date().toISOString() });

describe('LLM review modes and consent gating', { skip }, () => {
  let ctx;
  const calls = { single: 0, batch: [] };
  before(async () => {
    ctx = await startApp({
      classify: async () => { calls.single += 1; return { category: 'none', severity: 'low', confidence: 0.9, rationaleAr: '' }; },
      classifyBatch: async (items) => {
        calls.batch.push(items.length);
        return items.map((i) => (i.text.includes('burden')
          ? { category: 'self_harm', severity: 'high', confidence: 0.9, rationaleAr: 'إشارات غير مباشرة' }
          : { category: 'none', severity: 'low', confidence: 0.9, rationaleAr: '' }));
      },
    });
  });
  after(async () => { delete process.env.GUARDIAN_LLM_REVIEW; await ctx?.close(); });

  test('without llm_analysis consent the LLM is never called', async () => {
    process.env.GUARDIAN_LLM_REVIEW = 'all';
    const f = await setupFamily(ctx); // default scopes exclude llm_analysis
    await ctx.call('POST', '/v1/device/messages', { token: f.deviceToken, body: { items: [item("i'm a burden"), item('روح موت محد يحبك')] } });
    assert.equal(calls.single, 0);
    assert.equal(calls.batch.length, 0);
  });

  test('review-all mode: every message goes to the batch classifier, in chunks of 25', async () => {
    process.env.GUARDIAN_LLM_REVIEW = 'all';
    const f = await setupFamily(ctx, { scopes: ['content_monitoring', 'llm_analysis'] });
    const items = [item("i'm a burden to everyone"), ...Array(29).fill(item('see you at practice'))];
    const r = await ctx.call('POST', '/v1/device/messages', { token: f.deviceToken, body: { items } });
    assert.equal(r.body.alertsCreated, 1);
    assert.deepEqual(calls.batch, [25, 5]);
    const feed = await ctx.call('GET', `/v1/children/${f.childId}/alerts`, { token: f.token });
    assert.equal(feed.body.alerts[0].rationaleAr, 'إشارات غير مباشرة');
  });

  test('flagged mode: only rule/triage-flagged messages reach the single classifier', async () => {
    delete process.env.GUARDIAN_LLM_REVIEW;
    calls.single = 0;
    const f = await setupFamily(ctx, { scopes: ['content_monitoring', 'llm_analysis'] });
    const r = await ctx.call('POST', '/v1/device/messages', {
      token: f.deviceToken, body: { items: [item('see you at practice'), item('بقتلك اذا ما جيت 😂')] },
    });
    assert.equal(calls.single, 1);
    assert.equal(r.body.alertsCreated, 0, 'LLM judged the banter harmless');
  });
});
