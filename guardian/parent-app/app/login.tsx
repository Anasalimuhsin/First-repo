import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth';
import { ApiError } from '../src/api';
import { useTheme } from '../src/theme';
import { Button } from '../src/ui';

const ERRORS: Record<string, string> = {
  'Invalid email or password': 'البريد أو كلمة المرور غير صحيحة.',
  'MFA code required': 'أدخل رمز التحقق من تطبيق المصادقة.',
  'Invalid MFA code': 'رمز التحقق غير صحيح.',
  'Too many requests, try again later': 'محاولات كثيرة. حاول بعد قليل.',
};

export default function LoginScreen() {
  const { token, login } = useAuth();
  const { s } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Redirect href="/" />;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password, totp);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'تعذّر الاتصال بالخادم.';
      if (msg === 'MFA code required') setNeedTotp(true);
      setError(ERRORS[msg] ?? msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[s.content, { paddingTop: 96 }]} keyboardShouldPersistTaps="handled">
        <Text style={[s.title, { textAlign: 'center', fontSize: 28 }]}>Guardian</Text>
        <Text style={[s.muted, { textAlign: 'center', marginBottom: 16 }]}>تنبيهات السلامة الرقمية لأطفالك</Text>
        <View style={s.card}>
          <Text style={s.h2}>تسجيل الدخول</Text>
          <TextInput style={s.input} placeholder="البريد الإلكتروني" autoCapitalize="none" autoComplete="email"
                     keyboardType="email-address" value={email} onChangeText={setEmail} accessibilityLabel="البريد الإلكتروني" />
          <TextInput style={s.input} placeholder="كلمة المرور" secureTextEntry autoComplete="current-password"
                     value={password} onChangeText={setPassword} accessibilityLabel="كلمة المرور" />
          {needTotp && (
            <TextInput style={s.input} placeholder="رمز التحقق (6 أرقام)" keyboardType="number-pad" maxLength={6}
                       autoComplete="one-time-code" value={totp} onChangeText={setTotp} accessibilityLabel="رمز التحقق" autoFocus />
          )}
          {error && <Text style={s.error} accessibilityRole="alert">{error}</Text>}
          <Button title={busy ? '…' : 'دخول'} onPress={submit} disabled={busy || !email || !password} />
        </View>
        <Text style={[s.muted, { textAlign: 'center' }]}>أنشئ حسابك وأضف أطفالك من لوحة الويب.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
