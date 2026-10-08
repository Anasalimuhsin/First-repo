import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyWithLLM, classifyBatchWithLLM, MAX_BATCH } from '../../src/analyzer/llmClassifier.js';

// Minimal stand-in for the Anthropic client: records the request, returns a canned response.
function fakeClient(response) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (req) => { calls.push(req); return typeof response === 'function' ? response(req) : response; } } },
  };
}
const textResponse = (obj, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(obj) }] });

test('single: sends structured-output request with fallbacks and parses the result', async () => {
  const client = fakeClient(textResponse({ category: 'bullying', severity: 'high', confidence: 1.4, rationale_ar: 'تنمّر' }));
  const r = await classifyWithLLM({ text: 'x', source: 'sms', direction: 'incoming', ruleHits: [] }, { client });
  assert.deepEqual(r, { category: 'bullying', severity: 'high', confidence: 1, rationaleAr: 'تنمّر' });
  const req = client.calls[0];
  assert.equal(req.fallbacks, 'default');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.equal(req.output_config.effort, 'low');
  assert.equal(req.thinking, undefined);
  assert.doesNotMatch(req.messages[0].content, /childId|display/);
});

test('single: refusal or bad JSON → null (caller falls back to rules)', async () => {
  assert.equal(await classifyWithLLM({ text: 'x', ruleHits: [] }, { client: fakeClient({ stop_reason: 'refusal', content: [] }) }), null);
  assert.equal(await classifyWithLLM({ text: 'x', ruleHits: [] }, { client: fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{oops' }] }) }), null);
  const throwing = { beta: { messages: { create: async () => { throw new Error('network'); } } } };
  assert.equal(await classifyWithLLM({ text: 'x', ruleHits: [] }, { client: throwing }), null);
});

test('batch: results are aligned by index; missing ones are null', async () => {
  const client = fakeClient(textResponse({ results: [
    { index: 1, category: 'none', severity: 'low', confidence: 0.9, rationale_ar: '' },
    { index: 0, category: 'self_harm', severity: 'critical', confidence: 0.95, rationale_ar: 'خطر' },
    { index: 7, category: 'drugs', severity: 'high', confidence: 0.5, rationale_ar: 'out of range' },
  ] }));
  const items = [{ text: 'a' }, { text: 'b' }, { text: 'c' }];
  const out = await classifyBatchWithLLM(items, { client });
  assert.equal(out[0].category, 'self_harm');
  assert.equal(out[1].category, 'none');
  assert.equal(out[2], null);
  assert.equal(JSON.parse(client.calls[0].messages[0].content).messages.length, 3);
  await assert.rejects(classifyBatchWithLLM(Array(MAX_BATCH + 1).fill({ text: 'x' }), { client }));
});
