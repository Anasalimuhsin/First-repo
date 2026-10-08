'use client';

// Browser-side calls go through our own /api/proxy route, which adds the
// session token server-side. The custom header is required by the proxy as a
// CSRF guard (browsers can't send it cross-site without a CORS preflight).

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    method,
    headers: { 'x-guardian-csrf': '1', ...(body !== undefined && { 'content-type': 'application/json' }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = '/login?expired=1';
    throw new ApiError(401, 'Session expired');
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, json?.error ?? `HTTP ${res.status}`);
  return json as T;
}
