import { createApp } from './app.js';
import { loadFieldCrypto } from './lib/fieldCrypto.js';
import { createNotifier } from './lib/notifier.js';
import { createConsentVerifier } from './lib/consentVerifier.js';
import { forgetPushTokens } from './lib/auth.js';
import { classifyWithLLM, classifyBatchWithLLM } from './analyzer/llmClassifier.js';
import { logger } from './lib/logger.js';
import { pool } from './lib/db.js';

const fieldCrypto = await loadFieldCrypto();
const notifier = await createNotifier({ onInvalidTokens: forgetPushTokens });
// The LLM pass is optional: without credentials the service runs on rules only.
const classify = process.env.ANTHROPIC_API_KEY ? classifyWithLLM : null;
const classifyBatch = process.env.ANTHROPIC_API_KEY ? classifyBatchWithLLM : null;

const app = createApp({ fieldCrypto, notifier, classify, classifyBatch, consentVerifier: createConsentVerifier() });
const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => logger.info({ port, llm: Boolean(classify) }, 'guardian api listening'));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    logger.info({ signal }, 'shutting down');
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
