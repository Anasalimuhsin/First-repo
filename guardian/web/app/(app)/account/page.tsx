import Link from 'next/link';
import { api } from '@/lib/api';
import type { Child, FilterRule, Me } from '@/lib/types';
import { MfaPanel } from '@/components/account/MfaPanel';
import { FilterRules } from '@/components/account/FilterRules';
import { DangerZone } from '@/components/account/DangerZone';

export default async function AccountPage() {
  const [me, { rules }, { children }] = await Promise.all([
    api<Me>('/auth/me'),
    api<{ rules: FilterRule[] }>('/filter-rules'),
    api<{ children: Child[] }>('/children'),
  ]);
  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <h1>الحساب والإعدادات</h1>
      <div className="card">
        <p style={{ margin: 0 }}><strong>{me.fullName}</strong> · <span className="ltr">{me.email}</span></p>
        <p className="muted small" style={{ margin: 0 }}>{me.familyName} · المنطقة الزمنية <span className="ltr">{me.timezone}</span> · {me.role === 'owner' ? 'مالك العائلة' : 'ولي أمر مشارك'}</p>
      </div>
      <MfaPanel enabled={me.mfaEnabled} />
      <FilterRules rules={rules} kids={children} />
      <DangerZone isOwner={me.role === 'owner'} />
      <p className="center small"><Link href="/privacy">سياسة الخصوصية</Link></p>
    </div>
  );
}
