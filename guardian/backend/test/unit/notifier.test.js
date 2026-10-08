import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifier } from '../../src/lib/notifier.js';

test('routes Expo tokens to Expo and others to FCM, reports dead tokens', async () => {
  const expoCalls = [];
  const fcmCalls = [];
  let forgotten = [];
  const notifier = await createNotifier({
    env: {},
    fetchImpl: async (url, init) => {
      expoCalls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }));
    },
    fcmSender: async (tokens, n) => { fcmCalls.push({ tokens, n }); return ['fcm-dead']; },
    onInvalidTokens: async (t) => { forgotten = t; },
  });

  await notifier.alertCreated({
    parentPushTokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'fcm-1', 'fcm-dead'],
    childName: 'سارة', labelAr: 'تنمّر إلكتروني', severity: 'critical', alertId: 'x',
  });

  assert.equal(expoCalls.length, 1);
  assert.equal(expoCalls[0].body.length, 2);
  assert.equal(expoCalls[0].body[0].priority, 'high');
  assert.match(expoCalls[0].body[0].title, /عاجل/);
  assert.doesNotMatch(JSON.stringify(expoCalls[0].body), /excerpt/);
  assert.deepEqual(fcmCalls[0].tokens, ['fcm-1', 'fcm-dead']);
  assert.deepEqual(forgotten.sort(), ['ExponentPushToken[b]', 'fcm-dead']);
});

test('a push failure does not throw', async () => {
  const notifier = await createNotifier({ env: {}, fcmSender: null, fetchImpl: async () => { throw new Error('offline'); } });
  await notifier.geofenceEvent({ parentPushTokens: ['ExponentPushToken[a]'], childName: 'سارة', placeName: 'المدرسة', event: 'enter' });
});
