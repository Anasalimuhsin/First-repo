'use client';

import { call } from '@/lib/client';
import { formatDate } from '@/lib/labels';
import type { Device } from '@/lib/types';
import { useAction } from '../useAction';

export function DeviceList({ childId, devices }: { childId: string; devices: Device[] }) {
  const { run, busy, error } = useAction();
  if (devices.length === 0) return <p className="muted">لا يوجد جهاز مرتبط.</p>;
  return (
    <>
      <ul className="list">
        {devices.map((d) => {
          const stale = !d.lastSeenAt || Date.now() - new Date(d.lastSeenAt).getTime() > 24 * 3600_000;
          return (
            <li key={d.id} className="row spread">
              <span>
                <strong>{d.model ?? (d.platform === 'android' ? 'Android' : 'iPhone')}</strong>
                {d.appVersion && <span className="muted small"> · الإصدار {d.appVersion}</span>}
                <br />
                <span className={stale ? 'error small' : 'muted small'}>
                  آخر اتصال: {formatDate(d.lastSeenAt)}{stale && ' — لم يتصل منذ أكثر من يوم'}
                </span>
              </span>
              <button type="button" className="btn-secondary" disabled={busy}
                      onClick={() => run(() => call('DELETE', `/children/${childId}/devices/${d.id}`), { confirm: 'إلغاء ربط هذا الجهاز؟ سيتوقف عن الإرسال فوراً.' })}>
                إلغاء الربط
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="error">{error}</p>}
    </>
  );
}
