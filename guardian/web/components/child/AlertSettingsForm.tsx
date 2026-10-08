'use client';

import { useState } from 'react';
import { call } from '@/lib/client';
import { CATEGORY_LABELS, SEVERITY_LABELS } from '@/lib/labels';
import type { AlertSetting, Severity } from '@/lib/types';
import { useAction } from '../useAction';

export function AlertSettingsForm({ childId, initial }: { childId: string; initial: AlertSetting[] }) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { run, busy, error } = useAction();

  const update = (category: string, patch: Partial<AlertSetting>) => {
    setSaved(false);
    setSettings((cur) => cur.map((s) => (s.category === category ? { ...s, ...patch } : s)));
  };

  return (
    <div className="card">
      <h3>حساسية التنبيهات</h3>
      <p className="muted small">ستصلك تنبيهات الفئة عندما تكون خطورتها بهذا المستوى أو أعلى. تنبيهات إيذاء النفس لا يمكن إيقافها.</p>
      <table>
        <thead><tr><th>الفئة</th><th>مفعّلة</th><th>أقل خطورة للتنبيه</th></tr></thead>
        <tbody>
          {settings.map((s) => (
            <tr key={s.category}>
              <td>{CATEGORY_LABELS[s.category] ?? s.category}</td>
              <td>
                <input type="checkbox" aria-label={`تفعيل ${CATEGORY_LABELS[s.category]}`} checked={s.enabled}
                       disabled={s.category === 'self_harm'} onChange={(e) => update(s.category, { enabled: e.target.checked })} />
              </td>
              <td>
                <select value={s.minSeverity} onChange={(e) => update(s.category, { minSeverity: e.target.value as Severity })}
                        aria-label={`أقل خطورة لـ ${CATEGORY_LABELS[s.category]}`}>
                  {Object.entries(SEVERITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="error">{error}</p>}
      <div className="row" style={{ marginTop: '0.75rem' }}>
        <button type="button" disabled={busy}
                onClick={async () => setSaved(await run(() => call('PUT', `/children/${childId}/alert-settings`, { settings })))}>
          حفظ
        </button>
        {saved && <span className="muted small">تم الحفظ ✓</span>}
      </div>
    </div>
  );
}
