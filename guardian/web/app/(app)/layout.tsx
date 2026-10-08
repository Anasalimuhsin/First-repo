import Link from 'next/link';
import { api } from '@/lib/api';
import type { Me } from '@/lib/types';
import { LogoutButton } from '@/components/LogoutButton';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await api<Me>('/auth/me');
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">Guardian <span>●</span></Link>
          <nav className="nav">
            <Link href="/">الأطفال</Link>
            <Link href="/account">الحساب والإعدادات</Link>
            <span className="muted small hide-mobile">{me.fullName}</span>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
