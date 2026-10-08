import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../../src/lib/passwords.js';

test('hash verifies the right password only', async () => {
  const hash = await hashPassword('correct horse battery');
  assert.match(hash, /^scrypt\$32768\$8\$1\$/);
  assert.equal(await verifyPassword('correct horse battery', hash), true);
  assert.equal(await verifyPassword('wrong password!!', hash), false);
});

test('same password hashes differently (random salt)', async () => {
  assert.notEqual(await hashPassword('same-password'), await hashPassword('same-password'));
});

test('rejects unknown formats', async () => {
  assert.equal(await verifyPassword('x', 'md5$abc'), false);
});
