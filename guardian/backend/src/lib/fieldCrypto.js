// Application-level encryption for sensitive columns (alert excerpts, linked
// account tokens). AES-256-GCM, with the row's owner id as additional
// authenticated data so a ciphertext can't be copied onto another child's row.
//
// Format: v1.<keyId>.<iv>.<tag>.<ciphertext>  (base64url parts)

import crypto from 'node:crypto';

const VERSION = 'v1';

function loadKeys(env = process.env) {
  // GUARDIAN_DATA_KEYS="k2:base64key,k1:base64key" — first entry encrypts,
  // all entries decrypt, which allows key rotation without a migration stop.
  const raw = env.GUARDIAN_DATA_KEYS;
  if (!raw) throw new Error('GUARDIAN_DATA_KEYS is not set');
  const keys = new Map();
  for (const pair of raw.split(',')) {
    const [id, b64] = pair.trim().split(':');
    const key = Buffer.from(b64 ?? '', 'base64');
    if (!id || key.length !== 32) throw new Error(`Invalid data key "${id}" (need 32 bytes base64)`);
    keys.set(id, key);
  }
  return { activeId: raw.split(',')[0].trim().split(':')[0], keys };
}

export function createFieldCrypto(env = process.env) {
  const { activeId, keys } = loadKeys(env);

  return {
    encrypt(plaintext, aad) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', keys.get(activeId), iv);
      cipher.setAAD(Buffer.from(String(aad)));
      const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return [VERSION, activeId, iv, cipher.getAuthTag(), ct]
        .map((p) => (Buffer.isBuffer(p) ? p.toString('base64url') : p))
        .join('.');
    },

    decrypt(token, aad) {
      const [version, keyId, iv, tag, ct] = String(token).split('.');
      if (version !== VERSION) throw new Error('Unsupported ciphertext version');
      const key = keys.get(keyId);
      if (!key) throw new Error(`Unknown data key "${keyId}"`);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(String(aad)));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ct, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}

/** SHA-256 for bearer tokens: only the hash is stored in the database. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateToken() {
  return crypto.randomBytes(32).toString('base64url');
}
