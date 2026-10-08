// Push notifications to parents.
//
// Two transports, chosen per token:
//   * Expo push service — tokens like "ExponentPushToken[...]" from the Expo
//     parent app (Expo relays to FCM/APNs).
//   * Firebase Cloud Messaging — any other token, when FIREBASE_SERVICE_ACCOUNT
//     (JSON) or GOOGLE_APPLICATION_CREDENTIALS is configured.
// Without either, notifications are logged (development).
//
// Notification text never contains the child's message — the parent opens
// the app (authenticated) to see the excerpt.

import { logger } from './logger.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const isExpoToken = (t) => /^Expo(nent)?PushToken\[.+\]$/.test(t);

async function createFcmSender(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT && !env.GOOGLE_APPLICATION_CREDENTIALS) return null;
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getMessaging } = await import('firebase-admin/messaging');
  const app = initializeApp({
    credential: env.FIREBASE_SERVICE_ACCOUNT
      ? cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT))
      : applicationDefault(),
  });
  const messaging = getMessaging(app);

  return async (tokens, { title, body, data }) => {
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: data.severity === 'critical' ? 'high' : 'normal' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    return res.responses
      .map((r, i) => (!r.success && r.error?.code === 'messaging/registration-token-not-registered' ? tokens[i] : null))
      .filter(Boolean);
  };
}

function createExpoSender(fetchImpl) {
  return async (tokens, { title, body, data }) => {
    const res = await fetchImpl(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(tokens.map((to) => ({
        to, title, body, data, sound: 'default',
        priority: data.severity === 'critical' ? 'high' : 'default',
      }))),
    });
    if (!res.ok) throw new Error(`Expo push failed: ${res.status}`);
    const { data: tickets = [] } = await res.json();
    return tickets
      .map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? tokens[i] : null))
      .filter(Boolean);
  };
}

/**
 * @param {object} [options]
 * @param {Function} [options.onInvalidTokens] called with tokens to forget
 * @param {Function} [options.fetchImpl]
 * @param {Function|null} [options.fcmSender] override (tests)
 */
export async function createNotifier({ env = process.env, onInvalidTokens = async () => {}, fetchImpl = fetch, fcmSender } = {}) {
  const fcm = fcmSender === undefined ? await createFcmSender(env) : fcmSender;
  const expo = createExpoSender(fetchImpl);

  async function send(tokens, notification) {
    if (tokens.length === 0) return;
    const expoTokens = tokens.filter(isExpoToken);
    const fcmTokens = tokens.filter((t) => !isExpoToken(t));
    const invalid = [];
    try {
      if (expoTokens.length) invalid.push(...(await expo(expoTokens, notification)));
      if (fcmTokens.length && fcm) invalid.push(...(await fcm(fcmTokens, notification)));
      if (fcmTokens.length && !fcm) logger.info({ notification, to: fcmTokens.length }, 'push (FCM not configured)');
    } catch (error) {
      // A push failure must never fail the request that created the alert.
      logger.error({ err: error }, 'push delivery failed');
    }
    if (invalid.length) await onInvalidTokens(invalid);
  }

  return {
    async alertCreated({ parentPushTokens, childName, labelAr, severity, alertId }) {
      await send(parentPushTokens, {
        title: severity === 'critical' ? `تنبيه عاجل بخصوص ${childName}` : `تنبيه جديد بخصوص ${childName}`,
        body: `تم رصد محتوى قد يشير إلى: ${labelAr}. افتح التطبيق للتفاصيل.`,
        data: { type: 'alert', alertId, severity },
      });
    },

    async geofenceEvent({ parentPushTokens, childName, placeName, event }) {
      // Phrased with verbal nouns so the text is correct for any child's gender.
      const title = event === 'enter' ? `وصول ${childName} إلى ${placeName}` : `مغادرة ${childName} من ${placeName}`;
      await send(parentPushTokens, { title, body: '', data: { type: 'geofence', event } });
    },
  };
}
