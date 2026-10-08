'use client';

import { useState } from 'react';
import Link from 'next/link';

const ERRORS: Record<string, string> = {
  'Invalid email or password': 'البريد أو كلمة المرور غير صحيحة.',
  'MFA code required': 'أدخل رمز التحقق من تطبيق المصادقة.',
  'Invalid MFA code': 'رمز التحقق غير صحيح.',
  'An account with this email already exists': 'يوجد حساب بهذا البريد.',
  'Too many requests, try again later': 'محاولات كثيرة. حاول بعد قليل.',
};

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needTotp, setNeedTotp] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (mode === 'signup') data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await fetch(mode === 'login' ? '/api/session' : '/api/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-guardian-csrf': '1' },
      body: JSON.stringify(data),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      window.location.href = mode === 'signup' ? '/children/new' : '/';
      return;
    }
    if (json.error === 'MFA code required') setNeedTotp(true);
    setError(ERRORS[json.error] ?? json.error ?? 'حدث خطأ. حاول مرة أخرى.');
  }

  return (
    <form className="card form-narrow" onSubmit={onSubmit}>
      <h1>{mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب ولي أمر'}</h1>
      {mode === 'signup' && (
        <div className="field">
          <label htmlFor="fullName">الاسم</label>
          <input id="fullName" name="fullName" required maxLength={100} autoComplete="name" />
        </div>
      )}
      <div className="field">
        <label htmlFor="email">البريد الإلكتروني</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="ltr" />
      </div>
      <div className="field">
        <label htmlFor="password">كلمة المرور</label>
        <input id="password" name="password" type="password" required minLength={mode === 'signup' ? 10 : 1}
               autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="ltr" />
        {mode === 'signup' && <p className="muted small">10 أحرف على الأقل.</p>}
      </div>
      {needTotp && (
        <div className="field">
          <label htmlFor="totp">رمز التحقق (6 أرقام)</label>
          <input id="totp" name="totp" inputMode="numeric" pattern="\d{6}" autoComplete="one-time-code" className="ltr" autoFocus />
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={busy} style={{ width: '100%' }}>
        {busy ? '…' : mode === 'login' ? 'دخول' : 'إنشاء الحساب'}
      </button>
      <p className="center small" style={{ marginTop: '1rem' }}>
        {mode === 'login'
          ? <>ليس لديك حساب؟ <Link href="/signup">أنشئ حساباً</Link></>
          : <>لديك حساب؟ <Link href="/login">سجّل الدخول</Link></>}
      </p>
    </form>
  );
}
