import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { request, setUnauthorizedHandler } from './api';
import { loadToken, saveToken } from './storage';

interface AuthState {
  token: string | null;
  ready: boolean;
  login: (email: string, password: string, totp?: string) => Promise<void>;
  logout: () => Promise<void>;
  api: <T>(method: string, path: string, body?: unknown) => Promise<T>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadToken().then((t) => { setToken(t); setReady(true); });
  }, []);

  const clear = useCallback(async () => {
    await saveToken(null);
    setToken(null);
  }, []);

  useEffect(() => setUnauthorizedHandler(() => { clear(); }), [clear]);

  const value = useMemo<AuthState>(() => ({
    token,
    ready,
    async login(email, password, totp) {
      const r = await request<{ token: string }>('POST', '/auth/login', { body: { email, password, totp: totp || undefined } });
      await saveToken(r.token);
      setToken(r.token);
    },
    async logout() {
      if (token) await request('POST', '/auth/logout', { token }).catch(() => {});
      await clear();
    },
    api: (method, path, body) => request(method, path, { token, body }),
  }), [token, ready, clear]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
