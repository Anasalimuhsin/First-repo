import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createFieldCrypto } from '../../src/lib/fieldCrypto.js';

const key = () => crypto.randomBytes(32).toString('base64');

test('round-trips with matching AAD', () => {
  const fc = createFieldCrypto({ GUARDIAN_DATA_KEYS: `k1:${key()}` });
  const token = fc.encrypt('رسالة سرية', 'child-a');
  assert.equal(fc.decrypt(token, 'child-a'), 'رسالة سرية');
});

test('rejects ciphertext moved to another child (AAD mismatch)', () => {
  const fc = createFieldCrypto({ GUARDIAN_DATA_KEYS: `k1:${key()}` });
  const token = fc.encrypt('excerpt', 'child-a');
  assert.throws(() => fc.decrypt(token, 'child-b'));
});

test('decrypts data written with a rotated-out key', () => {
  const k1 = key();
  const old = createFieldCrypto({ GUARDIAN_DATA_KEYS: `k1:${k1}` });
  const token = old.encrypt('excerpt', 'c');
  const rotated = createFieldCrypto({ GUARDIAN_DATA_KEYS: `k2:${key()},k1:${k1}` });
  assert.equal(rotated.decrypt(token, 'c'), 'excerpt');
  assert.ok(rotated.encrypt('x', 'c').startsWith('v1.k2.'));
});

test('rejects malformed keys', () => {
  assert.throws(() => createFieldCrypto({ GUARDIAN_DATA_KEYS: 'k1:c2hvcnQ=' }));
  assert.throws(() => createFieldCrypto({}));
});
