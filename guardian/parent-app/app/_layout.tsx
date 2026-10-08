import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '../src/auth';
import { registerForPushNotifications } from '../src/push';
import { useTheme } from '../src/theme';

function PushRegistration() {
  const { token, api } = useAuth();

  // Register this device's push token with the current session.
  useEffect(() => {
    if (!token) return;
    registerForPushNotifications()
      .then((pushToken) => pushToken && api('PUT', '/auth/push-token', { pushToken }))
      .catch((e) => console.warn('push registration failed', e));
  }, [token, api]);

  // Tapping a notification opens the alert. (Not available in the web preview.)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (data: Record<string, unknown> | undefined) => {
      if (data?.type === 'alert' && typeof data.alertId === 'string') router.push(`/alert/${data.alertId}`);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last) open(last.notification.request.content.data);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    return () => sub.remove();
  }, []);

  return null;
}

export default function RootLayout() {
  const { c } = useTheme();
  return (
    <AuthProvider>
      <PushRegistration />
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.text,
          headerTitleAlign: 'center',
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'أطفالي' }} />
        <Stack.Screen name="login" options={{ title: 'تسجيل الدخول', headerShown: false }} />
        <Stack.Screen name="child/[id]" options={{ title: '' }} />
        <Stack.Screen name="alert/[id]" options={{ title: 'تنبيه' }} />
      </Stack>
    </AuthProvider>
  );
}
