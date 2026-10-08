'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { call } from '@/lib/client';
import { SCOPE_LABELS, formatDate } from '@/lib/labels';
import type { Consent } from '@/lib/types';
import { ConsentForm } from '../ConsentForm';
import { useAction } from '../useAction';

export function ConsentPanel({ childId, childName, consents, isOwner }: {
  childId: string; childName: string; consents: Consent[]; isOwner: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const { run, busy, error } = useAction();
  const active = consents.find((c) => !c.revokedAt);

  return (
    <>
      <div className="card stack">
        <h3>الموافقة الحالية</h3>
        {active ? (
          <>
            <ul>{active.scopes.map((s) => <li key={s}>{SCOPE_LABELS[s]?.title ?? s}</li>)}</ul>
            <p className="muted small">منذ {formatDate(active.grantedAt)} · سياسة الخصوصية {active.policyVersion}</p>
          </>
        ) : <p className="error">لا توجد موافقة فعّالة. المراقبة متوقفة بالكامل.</p>}
        {editing ? (
          <ConsentForm childId={childId} childName={childName} initialScopes={active?.scopes}
                       onDone={() => { setEditing(false); router.refresh(); }} />
        ) : (
          <div className="row">
            <button type="button" onClick={() => setEditing(true)}>{active ? 'تعديل النطاقات' : 'منح الموافقة'}</button>
            {active && (
              <button type="button" className="btn-danger" disabled={busy}
                      onClick={() => run(() => call('DELETE', `/children/${childId}/consents`), { confirm: 'سحب الموافقة يوقف كل المراقبة فوراً. متأكد؟' })}>
                سحب الموافقة
              </button>
            )}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {consents.length > 1 && (
        <div className="card">
          <h3>سجل الموافقات</h3>
          <ul className="list small">
            {consents.map((c) => (
              <li key={c.id}>
                {formatDate(c.grantedAt)} — {c.scopes.map((s) => SCOPE_LABELS[s]?.title ?? s).join('، ')}
                {c.revokedAt && <span className="muted"> (انتهت {formatDate(c.revokedAt)})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOwner && (
        <div className="card notice-danger">
          <h3>حذف الطفل</h3>
          <p className="muted small">يحذف نهائياً كل بيانات {childName}: التنبيهات والمواقع والأجهزة والإعدادات.</p>
          <button type="button" className="btn-danger" disabled={busy}
                  onClick={async () => {
                    const ok = await run(() => call('DELETE', `/children/${childId}`), { confirm: `حذف ${childName} وكل بياناته نهائياً؟` });
                    if (ok) window.location.href = '/';
                  }}>
            حذف نهائي
          </button>
        </div>
      )}
    </>
  );
}
