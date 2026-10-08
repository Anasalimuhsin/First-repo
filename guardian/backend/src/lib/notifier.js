// Push notifications to parents. The MVP logs to the console; production
// sends through Firebase Cloud Messaging (FCM covers both iOS via APNs and
// Android). Notification text never contains the child's message itself —
// the parent opens the app (authenticated) to see the excerpt.

export function createNotifier({ send = null } = {}) {
  return {
    async alertCreated({ parentPushTokens, childName, labelAr, severity, alertId }) {
      const notification = {
        title: severity === 'critical' ? `تنبيه عاجل بخصوص ${childName}` : `تنبيه جديد بخصوص ${childName}`,
        body: `تم رصد محتوى قد يشير إلى: ${labelAr}. افتح التطبيق للتفاصيل.`,
        data: { alertId, severity },
      };
      if (!send) {
        console.info('[notify]', JSON.stringify({ to: parentPushTokens.length, ...notification }));
        return;
      }
      await Promise.all(parentPushTokens.map((token) => send({ token, ...notification })));
    },

    async geofenceEvent({ parentPushTokens, childName, placeName, event }) {
      // Phrased with verbal nouns so the text is correct for any child's gender.
      const title = event === 'enter' ? `وصول ${childName} إلى ${placeName}` : `مغادرة ${childName} من ${placeName}`;
      const notification = { title, body: '', data: { event } };
      if (!send) {
        console.info('[notify]', JSON.stringify({ to: parentPushTokens.length, ...notification }));
        return;
      }
      await Promise.all(parentPushTokens.map((token) => send({ token, ...notification })));
    },
  };
}
