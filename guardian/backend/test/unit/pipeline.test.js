import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMessage } from '../../src/analyzer/index.js';

const msg = (text) => ({ text, source: 'sms', direction: 'incoming' });
const fakeLlm = (result) => async () => result;

test('rules only: strong signal alerts', async () => {
  const r = await analyzeMessage(msg('روح موت محد يحبك'));
  assert.equal(r.alert, true);
  assert.equal(r.category, 'bullying');
  assert.equal(r.detector, 'rules');
  assert.ok(r.parentGuidanceAr);
});

test('rules only: a single weak term does not alert', async () => {
  const r = await analyzeMessage(msg('يا غبي خسرتنا الجيم'));
  assert.equal(r.alert, false);
});

test('LLM can dismiss non-critical banter', async () => {
  const r = await analyzeMessage(msg('بقتلك اذا ما جيت الجيم الليلة 😂'), {
    classify: fakeLlm({ category: 'none', severity: 'low', confidence: 0.9, rationaleAr: 'مزاح بين أصدقاء' }),
  });
  assert.equal(r.alert, false);
});

test('LLM cannot suppress a critical self-harm signal', async () => {
  const r = await analyzeMessage(msg('ابي اموت'), {
    classify: fakeLlm({ category: 'none', severity: 'low', confidence: 0.8, rationaleAr: '' }),
  });
  assert.equal(r.alert, true);
  assert.equal(r.category, 'self_harm');
  assert.equal(r.severity, 'critical');
});

test('LLM can raise severity and supply a rationale', async () => {
  const r = await analyzeMessage(msg('كم عمرك؟ وين ساكن؟'), {
    classify: fakeLlm({ category: 'grooming', severity: 'high', confidence: 0.85, rationaleAr: 'شخص غريب يسأل عن العمر والعنوان' }),
  });
  assert.equal(r.alert, true);
  assert.equal(r.severity, 'high');
  assert.equal(r.detector, 'rules+llm');
  assert.equal(r.rationaleAr, 'شخص غريب يسأل عن العمر والعنوان');
});

test('falls back to rules when the LLM is unavailable', async () => {
  const r = await analyzeMessage(msg('روح موت محد يحبك'), { classify: fakeLlm(null) });
  assert.equal(r.detector, 'rules');
  assert.equal(r.alert, true);
});

test('without an LLM, triage-only messages never alert', async () => {
  const r = await analyzeMessage(msg("i'm a burden, i won't be around much longer"));
  assert.equal(r.alert, false);
});

test('with an LLM, triage-flagged messages are reviewed', async () => {
  let seen;
  const r = await analyzeMessage(msg('حطيت الحبوب جنبي والليلة بخلص'), {
    classify: async (input) => { seen = input; return { category: 'self_harm', severity: 'critical', confidence: 0.9, rationaleAr: 'خطة واضحة' }; },
  });
  assert.ok(seen.triageCategories.includes('self_harm'));
  assert.equal(r.alert, true);
  assert.equal(r.detector, 'llm');
  assert.equal(r.severity, 'critical');
});

test('unflagged messages skip the LLM unless reviewAll is set', async () => {
  let calls = 0;
  const classify = async () => { calls += 1; return { category: 'self_harm', severity: 'high', confidence: 0.8, rationaleAr: '' }; };
  assert.equal((await analyzeMessage(msg("i'm a burden to everyone"), { classify })).alert, false);
  assert.equal(calls, 0);
  const r = await analyzeMessage(msg("i'm a burden to everyone"), { classify, reviewAll: true });
  assert.equal(calls, 1);
  assert.equal(r.alert, true);
});
