import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { Redirect, Stack, router, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/auth';
import { useTheme } from '../src/theme';
import { Loading } from '../src/ui';

interface Child { id: string; displayName: string; birthYear: number; newAlerts: number; devices: number; scopes: string[] }

export default function ChildrenScreen() {
  const { token, ready, api, logout } = useAuth();
  const { s, c } = useTheme();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setChildren((await api<{ children: Child[] }>('GET', '/children')).children);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token, api]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!ready) return <Loading />;
  if (!token) return <Redirect href="/login" />;

  return (
    <>
      <Stack.Screen options={{
        headerLeft: () => <Pressable onPress={logout} accessibilityRole="button"><Text style={{ color: c.primary, fontSize: 15 }}>خروج</Text></Pressable>,
      }} />
      <FlatList
        style={s.screen}
        contentContainerStyle={s.content}
        data={children ?? []}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={children ? (
          <View style={s.card}><Text style={s.text}>لا يوجد أطفال بعد. أضفهم من لوحة الويب.</Text></View>
        ) : <Loading />}
        ListHeaderComponent={error ? <Text style={s.error}>{error}</Text> : null}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/child/[id]', params: { id: item.id, name: item.displayName } })}
                     style={({ pressed }) => [s.card, { opacity: pressed ? 0.8 : 1 }]}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.h2}>{item.displayName}</Text>
              {item.newAlerts > 0 ? (
                <View style={[s.badge, { backgroundColor: '#c0392b' }]}><Text style={s.badgeText}>{item.newAlerts} جديد</Text></View>
              ) : <Text style={s.muted}>لا تنبيهات جديدة</Text>}
            </View>
            <Text style={s.muted}>
              {new Date().getFullYear() - item.birthYear} سنة · {item.devices ? `${item.devices} جهاز مرتبط` : 'لا يوجد جهاز مرتبط'}
            </Text>
            {item.scopes.length === 0 && <Text style={s.error}>لا توجد موافقة فعّالة؛ المراقبة متوقفة.</Text>}
          </Pressable>
        )}
      />
    </>
  );
}
