import Link from 'next/link';
import { CATEGORY_LABELS, SEVERITY_LABELS, SOURCE_LABELS, STATUS_LABELS, formatDate } from '@/lib/labels';
import type { AlertSummary } from '@/lib/types';

export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`badge sev sev-${severity}`}>{SEVERITY_LABELS[severity] ?? severity}</span>;
}

export function AlertList({ alerts }: { alerts: AlertSummary[] }) {
  if (alerts.length === 0) return <p className="muted center">لا توجد تنبيهات هنا.</p>;
  return (
    <ul className="list">
      {alerts.map((a) => (
        <li key={a.id}>
          <Link href={`/alerts/${a.id}`} className="alert-row">
            {a.status === 'new' && <span className="dot" aria-label="جديد" />}
            <span style={{ flex: 1 }}>
              <strong>{CATEGORY_LABELS[a.category] ?? a.category}</strong>{' '}
              <span className="muted small">· {SOURCE_LABELS[a.source] ?? a.source} · {a.direction === 'incoming' ? 'وارد' : 'صادر'}</span>
              {a.rationaleAr && <><br /><span className="small">{a.rationaleAr}</span></>}
              <br /><span className="muted small">{formatDate(a.occurredAt)} · {STATUS_LABELS[a.status]}</span>
            </span>
            <SeverityBadge severity={a.severity} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
