import express, { Router } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { logger } from './lib/logger.js';
import { HttpError } from './lib/errors.js';
import { requireParent } from './lib/auth.js';
import { pool } from './lib/db.js';
import { authRouter } from './routes/auth.js';
import { deviceRouter } from './routes/device.js';
import { childrenRouter } from './routes/children.js';
import { settingsRouter, filterRulesRouter } from './routes/settings.js';
import { alertsRouter } from './routes/alerts.js';
import { accountsRouter, oauthCallbackRouter } from './routes/accounts.js';
import { privacyRouter } from './routes/privacy.js';

/**
 * @param {object} deps
 * @param {object} deps.fieldCrypto
 * @param {object} deps.notifier
 * @param {Function|null} deps.classify
 * @param {object} deps.consentVerifier
 * @param {object} [deps.env]
 * @param {Function} [deps.fetchImpl]  outbound HTTP (Google OAuth), injectable for tests
 */
export function createApp({ fieldCrypto, notifier, classify, consentVerifier, env = process.env, fetchImpl = fetch }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(env.TRUST_PROXY_HOPS ?? 1)); // TLS terminates at the load balancer

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/healthz' } }));
  app.use(helmet());
  const origins = (env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: origins.length ? origins : false, credentials: false, maxAge: 600 }));
  app.use(express.json({ limit: '1mb' }));

  // Limits are per IP. With several API instances, use a shared store (e.g. Redis).
  const limitsOff = env.NODE_ENV === 'test' && env.RATE_LIMITS !== 'on';
  const limiter = (windowMin, limit) =>
    rateLimit({ windowMs: windowMin * 60_000, limit: limitsOff ? 1e9 : limit, standardHeaders: 'draft-8', legacyHeaders: false,
                handler: (_req, _res, next) => next(new HttpError(429, 'Too many requests, try again later')) });
  const authLimiter = limiter(15, 20);
  const pairLimiter = limiter(15, 10);
  app.use('/v1', limiter(1, 600));

  app.get('/healthz', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });

  app.use('/v1/auth', authRouter({ fieldCrypto, authLimiter }));
  app.use('/v1/device', deviceRouter({ fieldCrypto, notifier, classify, pairLimiter }));
  app.use('/v1/oauth', oauthCallbackRouter({ fieldCrypto, webAppUrl: env.WEB_APP_URL ?? 'http://localhost:3001', fetchImpl }));

  const parent = Router();
  parent.use(requireParent);
  parent.use(childrenRouter({ consentVerifier }));
  parent.use(settingsRouter());
  parent.use(filterRulesRouter());
  parent.use(alertsRouter({ fieldCrypto }));
  parent.use(accountsRouter({ fieldCrypto, fetchImpl }));
  parent.use(privacyRouter({ fieldCrypto }));
  app.use('/v1', parent);

  app.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let status = err.status ?? err.statusCode ?? 500;
    if (err.type === 'entity.parse.failed') status = 400;
    if (status >= 500) req.log.error({ err }, 'request failed');
    res.status(status).json({ error: status >= 500 ? 'Internal error' : err.message });
  });

  return app;
}
