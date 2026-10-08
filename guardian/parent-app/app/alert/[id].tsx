import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../src/auth';
import { useTheme } from '../../src/theme';
import { Button, Loading, SeverityBadge } from '../../src/ui';
import { SOURCE_LABELS, STATUS_LABELS, formatDate } from '../../src/labels';

// Set per market in app.json → extra.emergencyNumber (911 in KSA/US, 999 in UAE, 112 in EU…).
const EMERGENCY_NUMBER = String(Constants.expoConfig?.extra?.emergencyNumber ?? '911');

interface AlertDetail {
  id: string; category: string; labelAr: string; parentGuidanceAr: string; severity: string; source: string;
  direction: string; excerpt: string; rationaleAr: string | null; status: string; occurredAt: string;
}

export default function AlertScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const { s, c } = useTheme();
  const [alert, setAlert] = useState<AlertDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<AlertDetail>('GET', `/alerts/${id}`).then(setAlert).catch((e) => setError(e.message)), [api, id]);
  useEffect(() => { load(); }, [load]);

  async function setStatus(status: string) {
    setBusy(true);
    try {
      await api('PATCH', `/alerts/${id}`, { status });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !alert) return <View style={s.content}><Text style={s.error}>{error}</Text></View>;
  if (!alert) return <Loading />;
  const closed = alert.status === 'resolved' || alert.status === 'dismissed';

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Stack.Screen options={{ title: alert.labelAr }} />
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.title}>{alert.labelAr}</Text>
        <SeverityBadge severity={alert.severity} />
      </View>
      <Text style={s.muted}>
        {SOURCE_LABELS[alert.source] ?? alert.source} · {alert.direction === 'incoming' ? 'رسالة واردة' : 'رسالة صادرة من طفلك'} · {formatDate(alert.occurredAt)} · {STATUS_LABELS[alert.status]}
      </Text>

      {alert.severity === 'critical' && alert.category === 'self_harm' && (
        <View style={[s.card, { borderRightWidth: 4, borderRightColor: c.danger }]}>
          <Text style={[s.text, { fontWeight: '700' }]}>إذا كان طفلك في خطر الآن، اتصل بالطوارئ فوراً.</Text>
          <Text style={s.muted}>ابقَ معه، وأبعد عنه أي وسيلة قد يؤذي بها نفسه، واطلب مساعدة مختص.</Text>
          <Button title={`اتصال بالطوارئ (${EMERGENCY_NUMBER})`} variant="danger" onPress={() => Linking.openURL(`tel:${EMERGENCY_NUMBER}`)} />
        </View>
      )}

      <View style={s.card}>
        <Text style={s.h2}>الرسالة</Text>
        <View style={{ backgroundColor: c.surface2, borderRadius: 10, padding: 12 }}>
          <Text style={[s.text, { fontSize: 17, writingDirection: 'auto' }]}>{alert.excerpt}</Text>
        </View>
        {alert.rationaleAr && <Text style={s.text}><Text style={{ fontWeight: '700' }}>لماذا: </Text>{alert.rationaleAr}</Text>}
        <Text style={s.muted}>مقتطف قصير فقط؛ لا نحتفظ بالمحادثة كاملة.</Text>
      </View>

      <View style={s.card}>
        <Text style={s.h2}>ماذا أفعل؟</Text>
        <Text style={s.text}>{alert.parentGuidanceAr}</Text>
      </View>

      {error && <Text style={s.error}>{error}</Text>}
      {closed
        ? <Button title="إعادة فتح" variant="secondary" disabled={busy} onPress={() => setStatus('viewed')} />
        : (
          <View style={{ gap: 8 }}>
            <Button title="تمت المعالجة" disabled={busy} onPress={() => setStatus('resolved')} />
            <Button title="إنذار خاطئ / تجاهل" variant="secondary" disabled={busy} onPress={() => setStatus('dismissed')} />
          </View>
        )}
    </ScrollView>
  );
}
