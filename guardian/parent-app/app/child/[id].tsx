import { useCallback, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, Text, View } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/auth';
import { useTheme } from '../../src/theme';
import { SeverityBadge } from '../../src/ui';
import { CATEGORY_LABELS, SOURCE_LABELS, STATUS_LABELS, formatDate } from '../../src/labels';

interface Alert { id: string; source: string; direction: string; category: string; severity: string; rationaleAr: string | null; status: string; occurredAt: string }
interface Location {
  latest: { lat: number; lng: number; accuracyM: number | null; batteryPct: number | null; recordedAt: string } | null;
  recentEvents: { event: 'enter' | 'exit'; occurredAt: string; placeName: string }[];
}

const FILTERS: [string, string][] = [['new', 'الجديدة'], ['viewed', 'المشاهدة'], ['resolved', 'المعالجة'], ['all', 'الكل']];

export default function ChildScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { api } = useAuth();
  const { s, c } = useTheme();
  const [filter, setFilter] = useState('new');
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const q = filter === 'all' ? '' : `?status=${filter}`;
    const [a, l] = await Promise.all([
      api<{ alerts: Alert[] }>('GET', `/children/${id}/alerts${q}`),
      api<Location>('GET', `/children/${id}/location`),
    ]);
    setAlerts(a.alerts);
    setLocation(l);
  }, [api, id, filter]);

  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  const header = (
    <View style={{ gap: 12 }}>
      <View style={s.card}>
        <Text style={s.h2}>الموقع</Text>
        {location?.latest ? (
          <>
            <Text style={s.muted}>
              آخر تحديث {formatDate(location.latest.recordedAt)}
              {location.latest.batteryPct != null ? ` · البطارية ${location.latest.batteryPct}%` : ''}
            </Text>
            {location.recentEvents.slice(0, 3).map((e, i) => (
              <Text key={i} style={s.text}>{e.event === 'enter' ? 'وصول إلى' : 'مغادرة'} {e.placeName} · <Text style={s.muted}>{formatDate(e.occurredAt)}</Text></Text>
            ))}
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(`https://www.google.com/maps?q=${location.latest!.lat},${location.latest!.lng}`)}>
              <Text style={[s.text, { color: c.primary }]}>فتح في الخرائط</Text>
            </Pressable>
          </>
        ) : <Text style={s.muted}>لا يوجد موقع بعد.</Text>}
      </View>
      <View style={[s.row, { flexWrap: 'wrap' }]}>
        {FILTERS.map(([key, label]) => (
          <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: filter === key }} onPress={() => setFilter(key)}
                     style={[s.badge, { paddingVertical: 6, backgroundColor: filter === key ? c.primary : c.surface2 }]}>
            <Text style={{ color: filter === key ? c.onPrimary : c.text, fontWeight: '600' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: name ?? '' }} />
      <FlatList
        style={s.screen}
        contentContainerStyle={s.content}
        data={alerts ?? []}
        keyExtractor={(a) => a.id}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load().catch(() => {}); setRefreshing(false); }} />}
        ListEmptyComponent={alerts ? <Text style={[s.muted, { textAlign: 'center' }]}>لا توجد تنبيهات هنا.</Text> : null}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/alert/${item.id}`)} style={({ pressed }) => [s.card, { opacity: pressed ? 0.8 : 1 }]}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <View style={[s.row]}>
                {item.status === 'new' && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#c0392b' }} />}
                <Text style={s.h2}>{CATEGORY_LABELS[item.category] ?? item.category}</Text>
              </View>
              <SeverityBadge severity={item.severity} />
            </View>
            {item.rationaleAr && <Text style={s.text}>{item.rationaleAr}</Text>}
            <Text style={s.muted}>
              {SOURCE_LABELS[item.source] ?? item.source} · {item.direction === 'incoming' ? 'وارد' : 'صادر'} · {formatDate(item.occurredAt)} · {STATUS_LABELS[item.status]}
            </Text>
          </Pressable>
        )}
      />
    </>
  );
}
