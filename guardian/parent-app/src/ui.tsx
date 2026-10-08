import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SEVERITY_COLORS, useTheme } from './theme';
import { SEVERITY_LABELS } from './labels';

export function Button({ title, onPress, variant = 'primary', disabled }: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean;
}) {
  const { s, c } = useTheme();
  const bg = variant === 'secondary' ? s.buttonSecondary : variant === 'danger' ? { backgroundColor: c.danger } : null;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled}
               style={({ pressed }) => [s.button, bg, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
      <Text style={[s.buttonText, variant === 'secondary' && s.buttonSecondaryText]}>{title}</Text>
    </Pressable>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const { s } = useTheme();
  return (
    <View style={[s.badge, { backgroundColor: SEVERITY_COLORS[severity] ?? '#6b7785' }]}>
      <Text style={s.badgeText}>{SEVERITY_LABELS[severity] ?? severity}</Text>
    </View>
  );
}

export function Loading() {
  const { c } = useTheme();
  return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>;
}
