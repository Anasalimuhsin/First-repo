import type { NextRequest } from 'next/server';

/**
 * CSRF guard for cookie-authenticated mutations: the request must carry our
 * custom header (impossible cross-site without a CORS preflight we never
 * allow) and, when the browser sends Origin, it must be this site.
 */
export function isSameOriginRequest(req: NextRequest): boolean {
  if (req.headers.get('x-guardian-csrf') !== '1') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
