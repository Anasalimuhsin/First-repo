import { NextResponse, type NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE, cookieOptions } from '@/lib/session';
import { isSameOriginRequest } from '@/lib/csrf';

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const res = await fetch(`${API_URL}/v1/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: body.email, password: body.password, fullName: body.fullName,
      familyName: body.familyName || undefined, timezone: body.timezone || undefined, locale: 'ar',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: json.error ?? 'Signup failed' }, { status: res.status });
  const out = NextResponse.json({ ok: true }, { status: 201 });
  out.cookies.set(SESSION_COOKIE, json.token, cookieOptions);
  return out;
}
