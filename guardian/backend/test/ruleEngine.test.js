import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreText } from '../src/analyzer/ruleEngine.js';

const top = (text) => scoreText(text)[0];

test('detects Arabic self-harm phrase despite spelling variants', () => {
  const hit = top('والله أُرِيدُ أنْ أمووووت');
  assert.equal(hit.category, 'self_harm');
  assert.equal(hit.severity, 'critical');
});

test('detects English self-harm with leetspeak', () => {
  assert.equal(top('i wanna k1ll myself').category, 'self_harm');
});

test('matches Arabic terms with attached clitics', () => {
  // "بالانتحار" = "about (the) suicide"
  assert.equal(top('يفكر بالانتحار').category, 'self_harm');
});

test('does not match inside a longer unrelated word', () => {
  // "سكينة" (a name / "calm") must not match "سكين" (knife).
  assert.deepEqual(scoreText('سكينة صديقتي'), []);
});

test('accumulates bullying signals', () => {
  const hit = top('انت فاشل ومحد يحبك، كلنا نكرهك');
  assert.equal(hit.category, 'bullying');
  assert.ok(hit.score >= 1.5);
  assert.equal(hit.severity, 'high');
});

test('grooming pattern: secrecy + photo request', () => {
  const hit = top("send me a pic and don't tell your parents ok");
  assert.equal(hit.category, 'grooming');
  assert.equal(hit.severity, 'high');
});

test('a term present in both languages is counted once', () => {
  const hit = top('suicide انتحار');
  assert.equal(hit.score, 0.5);
});

test('benign text has no hits', () => {
  assert.deepEqual(scoreText('نتقابل بكرة في المكتبة نذاكر رياضيات'), []);
  assert.deepEqual(scoreText(''), []);
});
