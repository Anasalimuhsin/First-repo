// Minimal Gmail API client (REST over fetch — no googleapis dependency).
// Scope: gmail.readonly. Google treats it as a *restricted* scope: production
// use requires OAuth app verification and an annual security assessment.

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export class GmailAuthError extends Error {}

export function gmailConfig(env = process.env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) return null;
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: env.GOOGLE_REDIRECT_URI };
}

export function authorizationUrl(config, state) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // always return a refresh token
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(fetchImpl, body) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (json.error === 'invalid_grant') throw new GmailAuthError('Refresh token revoked or expired');
    throw new Error(`Google token endpoint: ${res.status} ${json.error ?? ''}`);
  }
  return json;
}

export async function exchangeCode(config, code, fetchImpl = fetch) {
  const t = await tokenRequest(fetchImpl, {
    code, client_id: config.clientId, client_secret: config.clientSecret,
    redirect_uri: config.redirectUri, grant_type: 'authorization_code',
  });
  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 };
}

export async function refreshAccessToken(config, tokens, fetchImpl = fetch) {
  if (tokens.accessToken && tokens.expiresAt > Date.now() + 60_000) return tokens;
  const t = await tokenRequest(fetchImpl, {
    refresh_token: tokens.refreshToken, client_id: config.clientId,
    client_secret: config.clientSecret, grant_type: 'refresh_token',
  });
  return { ...tokens, accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
}

export async function revokeToken(token, fetchImpl = fetch) {
  await fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
}

async function api(fetchImpl, accessToken, path) {
  const res = await fetchImpl(`${API}${path}`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) throw new GmailAuthError('Access token rejected');
  if (!res.ok) throw new Error(`Gmail API ${path}: ${res.status}`);
  return res.json();
}

export async function getProfile(accessToken, fetchImpl = fetch) {
  return api(fetchImpl, accessToken, '/profile');
}

/** Ids of messages received after `afterMs` (Gmail search has 1-second granularity). */
export async function listMessageIdsSince(accessToken, afterMs, fetchImpl = fetch, max = 100) {
  const q = encodeURIComponent(`after:${Math.floor(afterMs / 1000)}`);
  const json = await api(fetchImpl, accessToken, `/messages?q=${q}&maxResults=${max}`);
  return (json.messages ?? []).map((m) => m.id);
}

export async function getMessage(accessToken, id, fetchImpl = fetch) {
  return api(fetchImpl, accessToken, `/messages/${id}?format=full`);
}

const decodeB64Url = (data) => Buffer.from(data ?? '', 'base64url').toString('utf8');

function htmlToText(html) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function collectParts(part, out = []) {
  if (!part) return out;
  if (part.parts) part.parts.forEach((p) => collectParts(p, out));
  else if (part.body?.data) out.push({ mimeType: part.mimeType, text: decodeB64Url(part.body.data) });
  return out;
}

/** Convert a Gmail API message into an analyzer item. */
export function messageToItem(message, maxLength = 10_000) {
  const headers = Object.fromEntries((message.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const parts = collectParts(message.payload);
  const plain = parts.filter((p) => p.mimeType === 'text/plain').map((p) => p.text).join('\n');
  const body = plain || parts.filter((p) => p.mimeType === 'text/html').map((p) => htmlToText(p.text)).join('\n');
  const text = [headers.subject, body || message.snippet].filter(Boolean).join('\n').slice(0, maxLength);
  return {
    source: 'email',
    direction: (message.labelIds ?? []).includes('SENT') ? 'outgoing' : 'incoming',
    text,
    occurredAt: new Date(Number(message.internalDate)),
    internalDate: Number(message.internalDate),
  };
}
