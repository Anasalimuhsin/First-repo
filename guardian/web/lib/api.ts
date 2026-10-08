import 'server-only';
import { redirect, notFound } from 'next/navigation';
import { API_URL, getToken } from './session';

/** Server-side GET against the Guardian API with the parent's session. */
export async function api<T>(path: string): Promise<T> {
  const token = await getToken();
  if (!token) redirect('/login');
  const res = await fetch(`${API_URL}/v1${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401) redirect('/login?expired=1');
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}
