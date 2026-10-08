'use client';

import { call } from '@/lib/client';
import type { AlertStatus } from '@/lib/types';
import { useAction } from './useAction';

export function AlertActions({ alertId, status }: { alertId: string; status: AlertStatus }) {
  const { run, busy, error } = useAction();
  const set = (s: AlertStatus) => run(() => call('PATCH', `/alerts/${alertId}`, { status: s }));
  return (
    <div className="stack">
      <div className="row">
        {status !== 'resolved' && <button type="button" disabled={busy} onClick={() => set('resolved')}>تمت المعالجة</button>}
        {status !== 'dismissed' && <button type="button" className="btn-secondary" disabled={busy} onClick={() => set('dismissed')}>إنذار خاطئ / تجاهل</button>}
        {(status === 'resolved' || status === 'dismissed') && <button type="button" className="btn-secondary" disabled={busy} onClick={() => set('viewed')}>إعادة فتح</button>}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
