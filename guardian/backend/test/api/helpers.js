// Shared setup for API tests. They need a real PostgreSQL:
//   TEST_DATABASE_URL=postgres://... npm run test:api
// Each test file resets the schema, so files must run one at a time
// (npm run test:api passes --test-concurrency=1).

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const skip = process.env.TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL not set';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Boots the app on a random port with fakes for push, Google and Stripe. */
export async function startApp({ fetchImpl, classify = null, classifyBatch = null } = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    DATABASE_SSL: 'false',
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_REDIRECT_URI: 'http://api.test/v1/oauth/gmail/callback',
  });
  const { pool } = await import('../../src/lib/db.js');
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.query(await fs.readFile(path.join(here, '../../db/schema.sql'), 'utf8'));

  const { createApp } = await import('../../src/app.js');
  const { createFieldCrypto } = await import('../../src/lib/fieldCrypto.js');
  const { createConsentVerifier } = await import('../../src/lib/consentVerifier.js');

  const fieldCrypto = createFieldCrypto({ GUARDIAN_DATA_KEYS: `k1:${crypto.randomBytes(32).toString('base64')}` });
  const notifications = [];
  const notifier = {
    alertCreated: async (n) => { notifications.push({ type: 'alert', ...n }); },
    geofenceEvent: async (n) => { notifications.push({ type: 'geofence', ...n }); },
  };
  const app = createApp({
    fieldCrypto, notifier, classify, classifyBatch,
    consentVerifier: createConsentVerifier({ env: { NODE_ENV: 'test' } }),
    env: { ...process.env, WEB_APP_URL: 'http://web.test' },
    fetchImpl,
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, url, { token, body } = {}) {
    const res = await fetch(base + url, {
      method,
      redirect: 'manual',
      headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body && { 'content-type': 'application/json' }) },
      body: body && JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    return { status: res.status, body: json, headers: res.headers };
  }

  return {
    base, call, pool, fieldCrypto, notifier, notifications,
    async close() {
      await new Promise((r) => server.close(r));
      await pool.end();
    },
  };
}

let counter = 0;
/** Sign up a parent, add a child with full consent, pair a device. */
export async function setupFamily(ctx, { scopes = ['content_monitoring', 'location', 'screen_time'] } = {}) {
  counter += 1;
  const email = `parent${counter}-${Date.now()}@example.com`;
  const signup = await ctx.call('POST', '/v1/auth/signup', { body: { email, password: 'long-password-1', fullName: 'Parent' } });
  const token = signup.body.token;
  const child = await ctx.call('POST', '/v1/children', { token, body: { displayName: 'سارة', birthYear: new Date().getFullYear() - 12 } });
  await ctx.call('POST', `/v1/children/${child.body.id}/consents`, {
    token, body: { scopes, method: 'dev_attestation', policyVersion: '2026-10', childNotified: true },
  });
  const pairing = await ctx.call('POST', `/v1/children/${child.body.id}/pairing-codes`, { token });
  const paired = await ctx.call('POST', '/v1/device/pair', { body: { code: pairing.body.code, platform: 'android', model: 'Pixel' } });
  return { email, token, childId: child.body.id, deviceToken: paired.body.deviceToken, deviceId: paired.body.deviceId };
}
