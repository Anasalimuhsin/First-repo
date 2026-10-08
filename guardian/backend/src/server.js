import express from 'express';
import { deviceRouter } from './routes/device.js';
import { parentRouter } from './routes/parent.js';
import { createFieldCrypto } from './lib/fieldCrypto.js';
import { createNotifier } from './lib/notifier.js';
import { classifyWithLLM } from './analyzer/llmClassifier.js';
import { HttpError } from './lib/auth.js';

const fieldCrypto = createFieldCrypto();
const notifier = createNotifier();
// The LLM pass is optional: without credentials the service runs on rules only.
const classify = process.env.ANTHROPIC_API_KEY ? classifyWithLLM : null;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // TLS terminates at the load balancer
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use('/v1/device', deviceRouter({ fieldCrypto, notifier, classify }));
app.use('/v1', parentRouter({ fieldCrypto }));

app.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal error' : err.message });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`guardian api listening on :${port} (llm ${classify ? 'on' : 'off'})`));
