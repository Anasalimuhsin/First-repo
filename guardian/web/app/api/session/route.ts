import { NextResponse, type NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE, cookieOptions } from '@/lib/session';
import { isSameOriginRequest } from '@/lib/csrf';

/** Login: exchanges credentials for an API session stored in an httpOnly cookie. */
export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${API_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '' },
    body: JSON.stringify({ email: body.email, password: body.password, totp: body.totp || undefined }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: json.error ?? 'Login failed' }, { status: res.status });
  const out = NextResponse.json({ ok: true });
  out.cookies.set(SESSION_COOKIE, json.token, cookieOptions);
  return out;
}

/** Logout: revokes the API session and clears the cookie. */
export async function DELETE(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    await fetch(`${API_URL}/v1/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }).catch(() => {});
  }
  const out = NextResponse.json({ ok: true });
  out.cookies.set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return out;
}
