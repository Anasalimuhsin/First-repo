'use client';

import { call } from '@/lib/client';
import { formatDate } from '@/lib/labels';
import type { LinkedAccount } from '@/lib/types';
import { useAction } from '../useAction';

export function AccountsPanel({ childId, accounts, gmailAvailable, status }: {
  childId: string; accounts: LinkedAccount[]; gmailAvailable: boolean; status?: string;
}) {
  const { run, busy, error } = useAction();
  const active = accounts.filter((a) => !a.disconnectedAt);

  async function connect() {
    const { authorizationUrl } = await call<{ authorizationUrl: string }>('POST', `/children/${childId}/accounts/gmail`);
    window.location.href = authorizationUrl;
  }

  return (
    <div className="card stack">
      <h3>الحسابات المرتبطة</h3>
      {status === 'connected' && <p className="notice">تم ربط حساب Gmail ✓ سيبدأ الفحص خلال دقائق.</p>}
      {status && status !== 'connected' && <p className="error">لم يكتمل ربط الحساب ({status}).</p>}
      <p className="muted small">
        يُفحص البريد الوارد والصادر الجديد كل بضع دقائق. لا تُحفظ الرسائل؛ يُحفظ مقتطف مشفّر من الرسائل المقلقة فقط.
        سجّل الدخول بحساب <strong>طفلك</strong> عند الربط.
      </p>
      {active.length > 0 && (
        <ul className="list">
          {active.map((a) => (
            <li key={a.id} className="row spread">
              <span>
                <strong>Gmail</strong> · آخر فحص: {formatDate(a.lastSyncedAt)}
                {a.lastError && <><br /><span className="error small">آخر خطأ: {a.lastError}</span></>}
              </span>
              <button type="button" className="btn-secondary" disabled={busy}
                      onClick={() => run(() => call('DELETE', `/children/${childId}/accounts/${a.id}`), { confirm: 'فصل الحساب وإلغاء صلاحية الوصول؟' })}>
                فصل
              </button>
            </li>
          ))}
        </ul>
      )}
      {gmailAvailable
        ? <div><button type="button" onClick={() => run(connect)} disabled={busy}>ربط حساب Gmail</button></div>
        : <p className="muted small">ربط Gmail غير مُعدّ على هذا الخادم (GOOGLE_CLIENT_ID).</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
