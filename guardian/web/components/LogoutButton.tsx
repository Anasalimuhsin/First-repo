'use client';

export function LogoutButton() {
  async function logout() {
    await fetch('/api/session', { method: 'DELETE', headers: { 'x-guardian-csrf': '1' } });
    window.location.href = '/login';
  }
  return <button type="button" className="btn-link" onClick={logout}>تسجيل الخروج</button>;
}
