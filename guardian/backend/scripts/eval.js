// Measures the analyzer on a labelled JSONL set ({ text, label } per line,
// label = category or "none").
//
//   npm run eval                          # rules only, synthetic set
//   npm run eval -- --llm                 # rules + Claude on flagged messages (needs ANTHROPIC_API_KEY; costs money)
//   npm run eval -- --llm --review-all    # Claude reviews every message
//   npm run eval -- --file eval/real.jsonl --min-self-harm-recall 0.95
//
// Exit code 1 if self-harm recall is below --min-self-harm-recall (CI gate).

import fs from 'node:fs';
import { analyzeMessage } from '../src/analyzer/index.js';
import { CATEGORIES } from '../src/analyzer/lexicon.js';
import { scoreText, REVIEW_THRESHOLD } from '../src/analyzer/ruleEngine.js';
import { triage } from '../src/analyzer/triage.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const file = opt('--file', new URL('../eval/synthetic.jsonl', import.meta.url).pathname);
const minSelfHarmRecall = Number(opt('--min-self-harm-recall', 0));
const reviewAll = args.includes('--review-all');
const classify = args.includes('--llm') ? (await import('../src/analyzer/llmClassifier.js')).classifyWithLLM : null;

const rows = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const labels = [...Object.keys(CATEGORIES), 'none'];
const stats = Object.fromEntries(labels.map((l) => [l, { tp: 0, fp: 0, fn: 0 }]));
const errors = [];
const review = { risky: 0, riskyReviewed: 0, safe: 0, safeReviewed: 0, missed: [] };

for (const row of rows) {
  const d = await analyzeMessage({ text: row.text, source: 'other', direction: 'incoming' }, { classify, reviewAll });
  const predicted = d.alert ? d.category : 'none';
  // Would this message reach an LLM review (when LLM analysis is enabled)?
  const top = scoreText(row.text)[0];
  const reviewed = Boolean(top && top.score >= REVIEW_THRESHOLD) || triage(row.text).length > 0;
  if (row.label === 'none') { review.safe += 1; review.safeReviewed += reviewed; }
  else { review.risky += 1; review.riskyReviewed += reviewed; if (!reviewed) review.missed.push(row.text); }
  if (predicted === row.label) {
    stats[row.label].tp += 1;
  } else {
    stats[predicted].fp += 1;
    stats[row.label].fn += 1;
    errors.push({ expected: row.label, predicted, severity: d.severity ?? '-', text: row.text });
  }
}

const pct = (n) => (Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : '  -');
console.log(`\n${rows.length} examples · ${classify ? `rules + LLM${reviewAll ? ' (review all)' : ''}` : 'rules only'} · ${file}\n`);
console.log('category       precision  recall   f1     (tp/fp/fn)');
const summary = {};
for (const l of labels) {
  const { tp, fp, fn } = stats[l];
  const p = tp / (tp + fp);
  const r = tp / (tp + fn);
  const f1 = (2 * p * r) / (p + r);
  summary[l] = { precision: p, recall: r, f1 };
  console.log(`${l.padEnd(14)} ${pct(p).padStart(8)} ${pct(r).padStart(8)} ${pct(f1).padStart(6)}   (${tp}/${fp}/${fn})`);
}
const alerts = rows.filter((r) => r.label !== 'none');
const caught = alerts.filter((r) => !errors.some((e) => e.text === r.text && e.predicted === 'none')).length;
const falseAlarms = errors.filter((e) => e.expected === 'none').length;
console.log(`\nany-risk recall: ${pct(caught / alerts.length)} · false alarms on safe messages: ${falseAlarms}/${rows.length - alerts.length}`);

console.log(`reaches LLM review (if enabled): ${pct(review.riskyReviewed / review.risky)} of risky · ${pct(review.safeReviewed / review.safe)} of safe messages`);
if (review.missed.length) console.log(`never reviewed: ${review.missed.map((t) => JSON.stringify(t)).join(', ')}`);

if (errors.length) {
  console.log('\nmistakes:');
  for (const e of errors) console.log(`  expected ${e.expected.padEnd(10)} got ${e.predicted.padEnd(10)} [${e.severity}]  ${e.text}`);
}

if (summary.self_harm.recall < minSelfHarmRecall) {
  console.error(`\nFAIL: self-harm recall ${pct(summary.self_harm.recall)} < required ${pct(minSelfHarmRecall)}`);
  process.exit(1);
}
