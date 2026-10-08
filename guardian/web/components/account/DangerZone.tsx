'use client';

import { useState } from 'react';
import { call } from '@/lib/client';
import { useAction } from '../useAction';

export function DangerZone({ isOwner }: { isOwner: boolean }) {
  const [password, setPassword] = useState('');
  const [revoked, setRevoked] = useState<number | null>(null);
  const { run, busy, error } = useAction();

  return (
    <>
      <div className="card stack">
        <h2>بياناتك</h2>
        <p className="muted small">نزّل نسخة كاملة من كل ما نحتفظ به عن عائلتك (JSON)، بما في ذلك مقتطفات التنبيهات.</p>
        <div><a className="btn btn-secondary" href="/api/proxy/me/export" download>تنزيل بياناتي</a></div>
        <p className="muted small">هل فقدت جهازاً سجلت الدخول منه؟ أنهِ كل الجلسات الأخرى.</p>
        <div className="row">
          <button type="button" className="btn-secondary" disabled={busy}
                  onClick={() => run(async () => setRevoked((await call<{ revoked: number }>('POST', '/auth/logout-others')).revoked))}>
            تسجيل الخروج من الأجهزة الأخرى
          </button>
          {revoked !== null && <span className="muted small">أُنهيت {revoked} جلسة.</span>}
        </div>
      </div>
      <div className="card stack notice-danger">
        <h2>حذف الحساب</h2>
        <p className="muted small">
          {isOwner
            ? 'أنت مالك العائلة: سيُحذف الحساب وكل الأطفال وكل بياناتهم نهائياً، وستتوقف أجهزتهم عن العمل.'
            : 'ستغادر العائلة ويُحذف حسابك. تبقى بيانات الأطفال لدى مالك العائلة.'}
        </p>
        <div className="row">
          <input type="password" aria-label="كلمة المرور للتأكيد" placeholder="كلمة المرور للتأكيد" value={password}
                 onChange={(e) => setPassword(e.target.value)} className="ltr" style={{ maxWidth: 260 }} autoComplete="current-password" />
          <button type="button" className="btn-danger" disabled={busy || !password}
                  onClick={async () => {
                    const ok = await run(() => call('DELETE', '/me', { password }), { confirm: 'هذا الإجراء نهائي ولا يمكن التراجع عنه. متأكد؟' });
                    if (ok) window.location.href = '/login';
                  }}>
            حذف الحساب نهائياً
          </button>
        </div>
        {error && <p className="error">{error === 'Wrong password' ? 'كلمة المرور غير صحيحة.' : error}</p>}
      </div>
    </>
  );
}
