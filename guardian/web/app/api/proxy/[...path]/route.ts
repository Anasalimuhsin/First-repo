import { NextResponse, type NextRequest } from 'next/server';
import { API_URL, SESSION_COOKIE } from '@/lib/session';
import { isSameOriginRequest } from '@/lib/csrf';

// Paths the browser may reach through the proxy. Device and auth-mutation
// endpoints are not exposed here.
const ALLOWED = /^(children|alerts|filter-rules|me|auth\/(me|mfa\/(setup|enable|disable)|logout-others))(\/|$)/;

type Ctx = { params: Promise<{ path: string[] }> };

async function forward(req: NextRequest, { params }: Ctx) {
  const path = (await params).path.join('/');
  if (!ALLOWED.test(path)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (req.method !== 'GET' && !isSameOriginRequest(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();
  const res = await fetch(`${API_URL}/v1/${path}${req.nextUrl.search}`, {
    method: req.method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body && { 'content-type': 'application/json' }),
      'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '',
    },
    body: body || undefined,
    cache: 'no-store',
  });

  const headers = new Headers({ 'content-type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' });
  const disposition = res.headers.get('content-disposition');
  if (disposition) headers.set('content-disposition', disposition);
  return new NextResponse(res.status === 204 ? null : res.body, { status: res.status, headers });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
