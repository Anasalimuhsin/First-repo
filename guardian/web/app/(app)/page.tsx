import Link from 'next/link';
import { api } from '@/lib/api';
import type { Child } from '@/lib/types';

export default async function HomePage() {
  const { children } = await api<{ children: Child[] }>('/children');
  const year = new Date().getFullYear();

  return (
    <>
      <div className="row spread" style={{ marginBottom: '1rem' }}>
        <h1>أطفالي</h1>
        <Link href="/children/new" className="btn">+ إضافة طفل</Link>
      </div>

      {children.length === 0 ? (
        <div className="card center stack">
          <h2>لم تضف أي طفل بعد</h2>
          <p className="muted">أضف طفلك، ووافق على ما تريد متابعته، ثم اربط جهازه برمز من 8 أرقام.</p>
          <div><Link href="/children/new" className="btn">ابدأ الآن</Link></div>
        </div>
      ) : (
        <div className="grid">
          {children.map((c) => (
            <Link key={c.id} href={`/children/${c.id}`} className="card" style={{ color: 'inherit', textDecoration: 'none' }}>
              <div className="row spread">
                <h2 style={{ margin: 0 }}>{c.displayName}</h2>
                {c.newAlerts ? <span className="badge sev sev-critical">{c.newAlerts} جديد</span> : <span className="badge">لا تنبيهات جديدة</span>}
              </div>
              <p className="muted small" style={{ marginTop: '0.5rem' }}>
                {year - c.birthYear} سنة · {c.devices ? `${c.devices} جهاز مرتبط` : 'لا يوجد جهاز مرتبط'}
              </p>
              {c.scopes?.length === 0 && <p className="error small">لا توجد موافقة فعّالة؛ المراقبة متوقفة.</p>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
