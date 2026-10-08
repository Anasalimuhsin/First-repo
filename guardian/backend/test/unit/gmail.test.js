import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageToItem, authorizationUrl, refreshAccessToken, GmailAuthError } from '../../src/lib/gmail.js';

const b64 = (s) => Buffer.from(s).toString('base64url');

test('extracts subject + text/plain body from multipart messages', () => {
  const item = messageToItem({
    internalDate: '1760000000000',
    labelIds: ['INBOX'],
    payload: {
      headers: [{ name: 'Subject', value: 'تحذير' }],
      parts: [
        { mimeType: 'multipart/alternative', parts: [
          { mimeType: 'text/plain', body: { data: b64('محد يحبك') } },
          { mimeType: 'text/html', body: { data: b64('<p>ignored</p>') } },
        ] },
      ],
    },
  });
  assert.equal(item.text, 'تحذير\nمحد يحبك');
  assert.equal(item.direction, 'incoming');
  assert.equal(item.source, 'email');
  assert.equal(item.occurredAt.getTime(), 1760000000000);
});

test('falls back to HTML stripped of tags and scripts, marks SENT as outgoing', () => {
  const item = messageToItem({
    internalDate: '1', labelIds: ['SENT'],
    payload: { mimeType: 'text/html', headers: [], body: { data: b64('<style>x{}</style><b>go&nbsp;die</b><br>now') } },
  });
  assert.equal(item.text, 'go die\nnow');
  assert.equal(item.direction, 'outgoing');
});

test('authorization URL requests offline read-only access with state', () => {
  const url = new URL(authorizationUrl({ clientId: 'cid', redirectUri: 'https://x/cb' }, 'st'));
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.match(url.searchParams.get('scope'), /gmail\.readonly/);
  assert.equal(url.searchParams.get('state'), 'st');
});

test('refresh: keeps valid tokens, maps invalid_grant to GmailAuthError', async () => {
  const fresh = { accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600_000 };
  assert.equal(await refreshAccessToken({}, fresh, () => assert.fail('no fetch')), fresh);
  const expired = { ...fresh, expiresAt: 0 };
  const fetchImpl = async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
  await assert.rejects(refreshAccessToken({ clientId: 'c', clientSecret: 's' }, expired, fetchImpl), GmailAuthError);
});
