'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { call } from '@/lib/client';

// The child app scans this. It carries the code and which API to talk to.
const API_PUBLIC_URL = process.env.NEXT_PUBLIC_API_PUBLIC_URL ?? 'http://localhost:3000';

export function PairingCode({ childId }: { childId: string }) {
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    try {
      const c = await call<{ code: string; expiresAt: string }>('POST', `/children/${childId}/pairing-codes`);
      setCode(c);
      const payload = `guardian://pair?code=${c.code}&api=${encodeURIComponent(API_PUBLIC_URL)}`;
      setQr(await QRCode.toDataURL(payload, { margin: 1, width: 220 }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    if (!code) return;
    const ms = new Date(code.expiresAt).getTime() - Date.now();
    const t = setTimeout(() => { setCode(null); setQr(null); }, Math.max(ms, 0));
    return () => clearTimeout(t);
  }, [code]);

  if (!code) {
    return (
      <div className="stack">
        <p className="muted">ثبّت تطبيق Guardian على جهاز طفلك، ثم أنشئ رمز ربط وامسحه من التطبيق أو اكتبه يدوياً.</p>
        <button type="button" onClick={generate}>إنشاء رمز ربط</button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }
  return (
    <div className="stack center">
      {qr && <img src={qr} alt="رمز QR لربط الجهاز" width={220} height={220} style={{ margin: '0 auto', borderRadius: 8 }} />}
      <div className="code" aria-label="رمز الربط">{code.code.slice(0, 4)} {code.code.slice(4)}</div>
      <p className="muted small">صالح لمدة 10 دقائق ولمرة واحدة.</p>
    </div>
  );
}
