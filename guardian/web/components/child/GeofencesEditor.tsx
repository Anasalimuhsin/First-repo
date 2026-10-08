'use client';

import { call } from '@/lib/client';
import type { Geofence } from '@/lib/types';
import { useAction } from '../useAction';

export function GeofencesEditor({ childId, geofences, suggestion }: {
  childId: string; geofences: Geofence[]; suggestion?: { lat: number; lng: number } | null;
}) {
  const { run, busy, error } = useAction();

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const ok = await run(() => call('POST', `/children/${childId}/geofences`, {
      name: d.get('name'), lat: Number(d.get('lat')), lng: Number(d.get('lng')), radiusM: Number(d.get('radiusM')),
      notifyEnter: d.get('notifyEnter') === 'on', notifyExit: d.get('notifyExit') === 'on',
    }));
    if (ok) form.reset();
  }

  return (
    <div className="card">
      <h3>الأماكن (تنبيهات الوصول والمغادرة)</h3>
      {geofences.length > 0 && (
        <ul className="list">
          {geofences.map((g) => (
            <li key={g.id} className="row spread">
              <span>
                <strong>{g.name}</strong> · نصف القطر {g.radiusM} م
                <br /><span className="muted small ltr">{g.lat.toFixed(5)}, {g.lng.toFixed(5)}</span>
              </span>
              <button type="button" className="btn-secondary" disabled={busy}
                      onClick={() => run(() => call('DELETE', `/children/${childId}/geofences/${g.id}`), { confirm: `حذف ${g.name}؟` })}>حذف</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="stack" style={{ marginTop: '0.75rem' }}>
        <div className="row">
          <div style={{ flex: '2 1 160px' }}><label htmlFor="gf-name">الاسم</label><input id="gf-name" name="name" required maxLength={40} placeholder="المدرسة" /></div>
          <div style={{ flex: '1 1 120px' }}><label htmlFor="gf-lat">خط العرض</label><input id="gf-lat" name="lat" type="number" step="any" min={-90} max={90} required className="ltr" defaultValue={suggestion?.lat} /></div>
          <div style={{ flex: '1 1 120px' }}><label htmlFor="gf-lng">خط الطول</label><input id="gf-lng" name="lng" type="number" step="any" min={-180} max={180} required className="ltr" defaultValue={suggestion?.lng} /></div>
          <div style={{ flex: '1 1 100px' }}><label htmlFor="gf-r">نصف القطر (م)</label><input id="gf-r" name="radiusM" type="number" min={50} max={5000} required defaultValue={150} /></div>
        </div>
        <div className="row">
          <label className="check"><input type="checkbox" name="notifyEnter" defaultChecked /> نبّهني عند الوصول</label>
          <label className="check"><input type="checkbox" name="notifyExit" defaultChecked /> نبّهني عند المغادرة</label>
        </div>
        <p className="muted small">نصيحة: افتح الموقع في خرائط Google، اضغط مطولاً على المكان وانسخ الإحداثيات.{suggestion && ' عبّأنا آخر موقع معروف للطفل.'}</p>
        {error && <p className="error">{error}</p>}
        <div><button type="submit" disabled={busy}>إضافة مكان</button></div>
      </form>
    </div>
  );
}
