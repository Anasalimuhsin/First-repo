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
