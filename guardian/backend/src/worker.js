// Background jobs: Gmail sync (every GMAIL_SYNC_MINUTES, default 5) and data
// retention (hourly). Run as a separate process: `npm run worker`.

import { loadFieldCrypto } from './lib/fieldCrypto.js';
import { createNotifier } from './lib/notifier.js';
import { forgetPushTokens } from './lib/auth.js';
import { classifyWithLLM, classifyBatchWithLLM } from './analyzer/llmClassifier.js';
import { syncAllGmail } from './jobs/gmailSync.js';
import { runRetention } from './jobs/retention.js';
import { logger } from './lib/logger.js';
import { pool } from './lib/db.js';

const fieldCrypto = await loadFieldCrypto();
const notifier = await createNotifier({ onInvalidTokens: forgetPushTokens });
const classify = process.env.ANTHROPIC_API_KEY ? classifyWithLLM : null;
const classifyBatch = process.env.ANTHROPIC_API_KEY ? classifyBatchWithLLM : null;

function every(minutes, name, fn) {
  let running = false;
  const tick = async () => {
    if (running) return; // never overlap runs of the same job
    running = true;
    try {
      logger.info({ job: name, result: await fn() }, 'job finished');
    } catch (error) {
      logger.error({ job: name, err: error }, 'job failed');
    } finally {
      running = false;
    }
  };
  tick();
  return setInterval(tick, minutes * 60_000);
}

const timers = [
  every(Number(process.env.GMAIL_SYNC_MINUTES) || 5, 'gmail-sync', () => syncAllGmail({ fieldCrypto, notifier, classify, classifyBatch })),
  every(60, 'retention', runRetention),
];

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    timers.forEach(clearInterval);
    await pool.end();
    process.exit(0);
  });
}
