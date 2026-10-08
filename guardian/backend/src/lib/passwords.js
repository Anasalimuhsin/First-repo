// Password hashing with scrypt (built into Node, memory-hard). Stored format:
//   scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>
// Parameters are stored with each hash, so they can be raised later and old
// hashes still verify.

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 32;
const maxmem = (N, r) => 256 * N * r; // scrypt needs ~128*N*r bytes

export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const { N, r, p } = PARAMS;
  const hash = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem: maxmem(N, r) });
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [algo, n, r, p, saltB64, hashB64] = String(stored).split('$');
  if (algo !== 'scrypt') return false;
  const N = Number(n), R = Number(r), P = Number(p);
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N, r: R, p: P, maxmem: maxmem(N, R),
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Used when the email doesn't exist, so login takes the same time either way.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummyHash);
}
