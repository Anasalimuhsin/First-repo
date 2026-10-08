'use client';

import { useState } from 'react';
import Link from 'next/link';
import { call } from '@/lib/client';
import { SCOPE_LABELS } from '@/lib/labels';

export const POLICY_VERSION = process.env.NEXT_PUBLIC_POLICY_VERSION ?? '2026-10';

export function ConsentForm({ childId, childName, initialScopes, onDone }: {
  childId: string; childName: string; initialScopes?: string[]; onDone: () => void;
}) {
  const [scopes, setScopes] = useState<string[]>(initialScopes ?? ['content_monitoring', 'location', 'screen_time']);
  const [accepted, setAccepted] = useState(false);
  const [childNotified, setChildNotified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (s: string) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call('POST', `/children/${childId}/consents`, {
        scopes, method: 'dev_attestation', policyVersion: POLICY_VERSION, childNotified,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <p>اختر ما توافق على متابعته لـ <strong>{childName}</strong>. يمكنك تغيير هذا أو سحب الموافقة في أي وقت.</p>
      {Object.entries(SCOPE_LABELS).map(([key, { title, detail }]) => (
        <label key={key} className="check card" style={{ marginBottom: 0 }}>
          <input type="checkbox" checked={scopes.includes(key)} onChange={() => toggle(key)} />
          <span><strong>{title}</strong><br /><span className="muted small">{detail}</span></span>
        </label>
      ))}
      <label className="check">
        <input type="checkbox" checked={childNotified} onChange={(e) => setChildNotified(e.target.checked)} required />
        <span>أخبرت طفلي أن التطبيق مثبّت وما الذي يتابعه (سيعرض التطبيق على جهازه شاشة توضيحية أيضاً).</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required />
        <span>أنا ولي أمر هذا الطفل أو وصيّه القانوني، وقرأت <Link href="/privacy" target="_blank">سياسة الخصوصية</Link> (الإصدار {POLICY_VERSION}) وأوافق عليها.</span>
      </label>
      <p className="muted small">
        ملاحظة: في الإنتاج يُطلب تحقق من هوية ولي الأمر (فحص بطاقة بنكية دون خصم) قبل تفعيل المراقبة، كما يشترط قانون COPPA.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={busy || scopes.length === 0 || !accepted || !childNotified}>تأكيد الموافقة</button>
    </form>
  );
}
