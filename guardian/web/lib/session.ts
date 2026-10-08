import { cookies } from 'next/headers';

// The API session token lives only in this httpOnly cookie; browser code never sees it.
export const SESSION_COOKIE = 'guardian_session';
export const SESSION_MAX_AGE = 30 * 24 * 3600;

export const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export async function getToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE,
};
