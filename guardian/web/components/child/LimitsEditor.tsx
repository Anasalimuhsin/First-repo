'use client';

import { useState } from 'react';
import { call } from '@/lib/client';
import type { DailyLimit } from '@/lib/types';
import { useAction } from '../useAction';

const COMMON_APPS: Record<string, string> = {
  'com.zhiliaoapp.musically': 'TikTok', 'com.instagram.android': 'Instagram', 'com.snapchat.android': 'Snapchat',
  'com.google.android.youtube': 'YouTube', 'com.roblox.client': 'Roblox', 'com.tencent.ig': 'PUBG Mobile',
  'com.whatsapp': 'WhatsApp', 'com.discord': 'Discord',
};

export function LimitsEditor({ childId, limits: initial }: { childId: string; limits: DailyLimit[] }) {
  const [limits, setLimits] = useState(initial.filter((l) => l.target === 'app'));
  const { run, busy, error } = useAction();
  const save = (next: DailyLimit[]) => run(() => call('PUT', `/children/${childId}/daily-limits`, { limits: next })).then((ok) => ok && setLimits(next));

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const value = String(data.get('app'));
    const minutes = Number(data.get('minutes'));
    await save([...limits.filter((l) => l.value !== value), { target: 'app', value, minutes }]);
  }

  return (
    <div className="card">
      <h3>حدود يومية للتطبيقات (Android)</h3>
      {limits.length > 0 && (
        <ul className="list">
          {limits.map((l) => (
            <li key={l.value} className="row spread">
              <span><bdi>{COMMON_APPS[l.value] ?? l.value}</bdi>: {l.minutes === 0 ? 'محظور' : `${l.minutes} دقيقة يومياً`}</span>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => save(limits.filter((x) => x.value !== l.value))}>إزالة</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="row" style={{ marginTop: '0.75rem', alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 200px' }}>
          <label htmlFor="lim-app">التطبيق</label>
          <input id="lim-app" name="app" list="common-apps" required className="ltr" placeholder="com.zhiliaoapp.musically" />
          <datalist id="common-apps">{Object.entries(COMMON_APPS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</datalist>
        </div>
        <div style={{ flex: '1 1 120px' }}>
          <label htmlFor="lim-min">دقائق يومياً (0 = حظر)</label>
          <input id="lim-min" name="minutes" type="number" min={0} max={1440} required defaultValue={60} />
        </div>
        <button type="submit" disabled={busy}>إضافة</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
