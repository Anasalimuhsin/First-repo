// Try the analyzer from the command line:
//   npm run analyze -- "محد يحبك روح موت"
//   ANTHROPIC_API_KEY=... npm run analyze -- --llm "I want to die lol this exam"

import { analyzeMessage, scoreText } from '../src/analyzer/index.js';

const args = process.argv.slice(2);
const useLlm = args.includes('--llm');
const text = args.filter((a) => a !== '--llm').join(' ');
if (!text) {
  console.error('usage: npm run analyze -- [--llm] "<message>"');
  process.exit(1);
}

const classify = useLlm ? (await import('../src/analyzer/llmClassifier.js')).classifyWithLLM : null;
console.log('rule hits:', JSON.stringify(scoreText(text), null, 2));
console.log('decision :', JSON.stringify(
  await analyzeMessage({ text, source: 'other', direction: 'incoming' }, { classify }), null, 2));
