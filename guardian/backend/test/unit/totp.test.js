import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32Encode, base32Decode, totpAt, verifyTotp, generateSecret, otpauthUrl } from '../../src/lib/totp.js';

// RFC 6238 test secret (ASCII "12345678901234567890").
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

test('base32 round-trip', () => {
  const buf = Buffer.from('hello guardian');
  assert.deepEqual(base32Decode(base32Encode(buf)), buf);
  assert.equal(RFC_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
});

test('matches RFC 6238 SHA-1 vectors (last 6 digits)', () => {
  assert.equal(totpAt(RFC_SECRET, 59_000), '287082');
  assert.equal(totpAt(RFC_SECRET, 1_111_111_109_000), '081804');
  assert.equal(totpAt(RFC_SECRET, 1_234_567_890_000), '005924');
});

test('accepts ±1 step of drift, rejects older codes', () => {
  const secret = generateSecret();
  const now = 1_700_000_000_000;
  assert.equal(verifyTotp(secret, totpAt(secret, now - 30_000), now), true);
  assert.equal(verifyTotp(secret, totpAt(secret, now + 30_000), now), true);
  assert.equal(verifyTotp(secret, totpAt(secret, now - 90_000), now), false);
  assert.equal(verifyTotp(secret, 'abcdef', now), false);
});

test('otpauth URL is well formed', () => {
  assert.match(otpauthUrl('ABC', 'a@b.com'), /^otpauth:\/\/totp\/Guardian%3Aa%40b\.com\?secret=ABC&issuer=Guardian/);
});
