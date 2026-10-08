'use client';

import { call } from '@/lib/client';
import { DAY_LABELS } from '@/lib/labels';
import type { Schedule } from '@/lib/types';
import { useAction } from '../useAction';

const MODE_LABELS = { block_internet: 'إيقاف الإنترنت', allowlist_only: 'المسموح فقط' };

export function SchedulesEditor({ childId, schedules }: { childId: string; schedules: Schedule[] }) {
  const { run, busy, error } = useAction();

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const ok = await run(() => call('POST', `/children/${childId}/schedules`, {
      name: data.get('name'),
      daysOfWeek: data.getAll('days').map(Number),
      startsAt: data.get('startsAt'),
      endsAt: data.get('endsAt'),
      mode: data.get('mode'),
    }));
    if (ok) form.reset();
  }

  return (
    <div className="card">
      <h3>جداول وقت الشاشة</h3>
      <p className="muted small">تُطبَّق على جهاز الطفل حتى بدون اتصال. الجدول الذي ينتهي بعد منتصف الليل (مثلاً من 21:30 إلى 06:30) مدعوم.</p>
      {schedules.length > 0 && (
        <ul className="list">
          {schedules.map((s) => (
            <li key={s.id} className="row spread">
              <span>
                <strong>{s.name}</strong> · من <bdi>{s.startsAt}</bdi> إلى <bdi>{s.endsAt}</bdi> · {MODE_LABELS[s.mode]}{!s.enabled && <span className="muted"> (متوقف)</span>}
                <br /><span className="muted small">{s.daysOfWeek.map((d) => DAY_LABELS[d]).join('، ')}</span>
              </span>
              <span className="row">
                <button type="button" className="btn-secondary" disabled={busy}
                        onClick={() => run(() => call('PUT', `/children/${childId}/schedules/${s.id}`, { ...s, enabled: !s.enabled }))}>
                  {s.enabled ? 'إيقاف مؤقت' : 'تفعيل'}
                </button>
                <button type="button" className="btn-secondary" disabled={busy}
                        onClick={() => run(() => call('DELETE', `/children/${childId}/schedules/${s.id}`), { confirm: 'حذف هذا الجدول؟' })}>
                  حذف
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="stack" style={{ marginTop: '1rem' }}>
        <div className="row">
          <div style={{ flex: '2 1 160px' }}><label htmlFor="sch-name">الاسم</label><input id="sch-name" name="name" required maxLength={40} placeholder="وقت النوم" /></div>
          <div style={{ flex: '1 1 100px' }}><label htmlFor="sch-start">من</label><input id="sch-start" name="startsAt" type="time" required defaultValue="21:30" /></div>
          <div style={{ flex: '1 1 100px' }}><label htmlFor="sch-end">إلى</label><input id="sch-end" name="endsAt" type="time" required defaultValue="06:30" /></div>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="sch-mode">الإجراء</label>
            <select id="sch-mode" name="mode">{Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
        </div>
        <fieldset className="row" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 600 }}>الأيام</legend>
          {DAY_LABELS.map((d, i) => (
            <label key={d} className="check" style={{ fontWeight: 400 }}>
              <input type="checkbox" name="days" value={i} defaultChecked={i <= 4} /> {d}
            </label>
          ))}
        </fieldset>
        {error && <p className="error">{error}</p>}
        <div><button type="submit" disabled={busy}>إضافة جدول</button></div>
      </form>
    </div>
  );
}
