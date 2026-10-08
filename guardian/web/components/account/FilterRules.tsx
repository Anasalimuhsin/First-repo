'use client';

import { useEffect, useState } from 'react';
import { call } from '@/lib/client';
import { WEB_CATEGORIES } from '@/lib/labels';
import type { Child, FilterRule } from '@/lib/types';
import { useAction } from '../useAction';

export function FilterRules({ rules, kids }: { rules: FilterRule[]; kids: Child[] }) {
  const { run, busy, error } = useAction();
  // Optimistic checkbox state until the refreshed rules arrive.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  useEffect(() => setPending({}), [rules]);
  const childName = (id: string | null) => (id ? kids.find((k) => k.id === id)?.displayName ?? '—' : 'كل الأطفال');
  const categories = rules.filter((r) => r.target === 'web_category');
  const domains = rules.filter((r) => r.target !== 'web_category');

  const add = (body: object) => run(() => call('POST', '/filter-rules', body));

  return (
    <div className="card stack" id="filters">
      <h2>تصفية الويب</h2>
      <p className="muted small">تُطبَّق على أجهزة Android عبر فلتر DNS محلي. قاعدة خاصة بطفل تتقدم على قاعدة العائلة.</p>

      <h3>فئات محظورة</h3>
      <div className="row">
        {Object.entries(WEB_CATEGORIES).map(([key, label]) => {
          const rule = categories.find((r) => r.value === key && r.childId === null);
          const blocked = pending[key] ?? rule?.action === 'block';
          return (
            <label key={key} className="check">
              <input type="checkbox" checked={blocked} disabled={busy}
                     onChange={() => {
                       setPending((p) => ({ ...p, [key]: !blocked }));
                       if (rule) run(() => call('DELETE', `/filter-rules/${rule.id}`));
                       else add({ target: 'web_category', value: key, action: 'block' });
                     }} />
              {label}
            </label>
          );
        })}
      </div>

      <h3>مواقع محددة</h3>
      {domains.length > 0 && (
        <table>
          <thead><tr><th>الموقع</th><th>الإجراء</th><th>ينطبق على</th><th /></tr></thead>
          <tbody>
            {domains.map((r) => (
              <tr key={r.id}>
                <td className="ltr">{r.value}</td>
                <td>{r.action === 'block' ? 'حظر' : 'سماح'}</td>
                <td>{childName(r.childId)}</td>
                <td><button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => call('DELETE', `/filter-rules/${r.id}`))}>حذف</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const d = new FormData(form);
        const ok = await add({ target: 'domain', value: d.get('domain'), action: d.get('action'), childId: d.get('childId') || null });
        if (ok) form.reset();
      }}>
        <div style={{ flex: '2 1 200px' }}><label htmlFor="fr-domain">النطاق</label><input id="fr-domain" name="domain" required placeholder="example.com" className="ltr" /></div>
        <div style={{ flex: '1 1 110px' }}><label htmlFor="fr-action">الإجراء</label><select id="fr-action" name="action"><option value="block">حظر</option><option value="allow">سماح</option></select></div>
        <div style={{ flex: '1 1 140px' }}>
          <label htmlFor="fr-child">ينطبق على</label>
          <select id="fr-child" name="childId"><option value="">كل الأطفال</option>{kids.map((k) => <option key={k.id} value={k.id}>{k.displayName}</option>)}</select>
        </div>
        <button type="submit" disabled={busy}>إضافة</button>
      </form>
      {error && <p className="error">{error === 'domain' ? 'نطاق غير صالح' : error}</p>}
    </div>
  );
}
