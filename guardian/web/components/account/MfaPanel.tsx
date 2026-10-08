'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { call } from '@/lib/client';
import { useAction } from '../useAction';

export function MfaPanel({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const { run, busy, error } = useAction();

  async function start() {
    const s = await call<{ secret: string; otpauthUrl: string }>('POST', '/auth/mfa/setup');
    setSetup({ secret: s.secret, qr: await QRCode.toDataURL(s.otpauthUrl, { margin: 1, width: 200 }) });
  }

  return (
    <div className="card stack">
      <h2>التحقق بخطوتين</h2>
      {enabled ? (
        <>
          <p>مفعّل ✓ يُطلب رمز من تطبيق المصادقة عند كل تسجيل دخول.</p>
          <div className="row">
            <input aria-label="رمز التحقق" placeholder="رمز من 6 أرقام" inputMode="numeric" value={code}
                   onChange={(e) => setCode(e.target.value)} className="ltr" style={{ maxWidth: 180 }} />
            <button type="button" className="btn-secondary" disabled={busy || code.length !== 6}
                    onClick={() => run(() => call('POST', '/auth/mfa/disable', { code }))}>إيقاف</button>
          </div>
        </>
      ) : setup ? (
        <>
          <p>امسح الرمز بتطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو 1Password)، ثم أدخل الرمز الذي يظهر.</p>
          <img src={setup.qr} alt="رمز QR للتحقق بخطوتين" width={200} height={200} />
          <p className="muted small">أو أدخل المفتاح يدوياً: <code className="ltr">{setup.secret}</code></p>
          <div className="row">
            <input aria-label="رمز التحقق" placeholder="123456" inputMode="numeric" value={code}
                   onChange={(e) => setCode(e.target.value)} className="ltr" style={{ maxWidth: 180 }} />
            <button type="button" disabled={busy || code.length !== 6}
                    onClick={() => run(() => call('POST', '/auth/mfa/enable', { code }))}>تفعيل</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">ننصح بشدة بتفعيله: حسابك يحتوي معلومات حساسة عن أطفالك.</p>
          <div><button type="button" onClick={() => run(start)} disabled={busy}>إعداد التحقق بخطوتين</button></div>
        </>
      )}
      {error && <p className="error">{error === 'Invalid code' ? 'الرمز غير صحيح.' : error}</p>}
    </div>
  );
}
