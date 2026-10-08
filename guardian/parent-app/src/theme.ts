import { I18nManager, StyleSheet, useColorScheme } from 'react-native';

// Layout direction is handled explicitly (row-reverse + right alignment +
// rtl writing direction) so the app looks the same whatever the device
// language, instead of depending on I18nManager's RTL swap and app restarts.
I18nManager.allowRTL(false);

const light = {
  bg: '#f6f7f9', surface: '#ffffff', surface2: '#f0f2f5', text: '#1b2430', muted: '#5b6676',
  border: '#dfe3e8', primary: '#0f6e6a', onPrimary: '#ffffff', danger: '#c0392b',
};
const dark = {
  bg: '#0f141a', surface: '#161d25', surface2: '#1d2630', text: '#e6ebf0', muted: '#9aa6b4',
  border: '#2a3542', primary: '#3cb8b0', onPrimary: '#06201f', danger: '#ef6b5b',
};
export const SEVERITY_COLORS: Record<string, string> = { low: '#6b7785', medium: '#b7791f', high: '#d35400', critical: '#c0392b' };

export type Colors = typeof light;

export function useTheme() {
  const c = useColorScheme() === 'dark' ? dark : light;
  const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 16, gap: 12 },
    card: { backgroundColor: c.surface, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, padding: 16, gap: 8 },
    title: { fontSize: 22, fontWeight: '700', color: c.text, textAlign: 'right', writingDirection: 'rtl' },
    h2: { fontSize: 17, fontWeight: '700', color: c.text, textAlign: 'right', writingDirection: 'rtl' },
    text: { fontSize: 16, color: c.text, textAlign: 'right', lineHeight: 24, writingDirection: 'rtl' },
    muted: { fontSize: 14, color: c.muted, textAlign: 'right', writingDirection: 'rtl' },
    error: { fontSize: 14, color: c.danger, textAlign: 'right', writingDirection: 'rtl' },
    input: {
      borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 16, color: c.text, backgroundColor: c.surface, textAlign: 'right',
    },
    button: { backgroundColor: c.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
    buttonText: { color: c.onPrimary, fontSize: 16, fontWeight: '700' },
    buttonSecondary: { backgroundColor: c.surface2, borderColor: c.border, borderWidth: 1 },
    buttonSecondaryText: { color: c.text },
    row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
    badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
    badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  });
  return { c, s };
}
