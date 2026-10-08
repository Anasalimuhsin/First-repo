// Application-level encryption for sensitive columns (alert excerpts, linked
// account tokens). AES-256-GCM, with the row's owner id as additional
// authenticated data so a ciphertext can't be copied onto another child's row.
//
// Format: v1.<keyId>.<iv>.<tag>.<ciphertext>  (base64url parts)

import crypto from 'node:crypto';

const VERSION = 'v1';

// Key list format: "k2:<base64>,k1:<base64>" — the first entry encrypts, all
// entries decrypt, which allows key rotation without a migration stop.
function parseKeyList(raw, decode = (b64) => Buffer.from(b64, 'base64')) {
  return raw.split(',').map((pair) => {
    const [id, value] = pair.trim().split(':');
    if (!id || !value) throw new Error(`Invalid data key entry "${pair}"`);
    return { id, value, decode };
  });
}

function buildKeys(entries) {
  const keys = new Map();
  for (const { id, key } of entries) {
    if (key.length !== 32) throw new Error(`Invalid data key "${id}" (need 32 bytes)`);
    keys.set(id, key);
  }
  return { activeId: entries[0].id, keys };
}

function loadKeys(env) {
  const raw = env.GUARDIAN_DATA_KEYS;
  if (!raw) throw new Error('GUARDIAN_DATA_KEYS is not set');
  return buildKeys(parseKeyList(raw).map((e) => ({ id: e.id, key: e.decode(e.value) })));
}

/**
 * Production key loading. Supported sources, in order:
 *   GUARDIAN_DATA_KEYS_KMS  "k1:<base64 KMS ciphertext>,…" — data keys wrapped
 *                           by AWS KMS (envelope encryption); unwrapped at boot,
 *                           held only in memory. Needs AWS credentials + kms:Decrypt.
 *   GUARDIAN_DATA_KEYS_FILE path to a file containing the plain key list
 *                           (e.g. a mounted Kubernetes / Docker secret).
 *   GUARDIAN_DATA_KEYS      plain key list (development).
 */
export async function loadFieldCrypto(env = process.env) {
  if (env.GUARDIAN_DATA_KEYS_KMS) {
    const { KMSClient, DecryptCommand } = await import('@aws-sdk/client-kms');
    const kms = new KMSClient({});
    const entries = [];
    for (const e of parseKeyList(env.GUARDIAN_DATA_KEYS_KMS)) {
      const { Plaintext } = await kms.send(new DecryptCommand({ CiphertextBlob: Buffer.from(e.value, 'base64') }));
      entries.push({ id: e.id, key: Buffer.from(Plaintext) });
    }
    return createFieldCryptoFromKeys(buildKeys(entries));
  }
  if (env.GUARDIAN_DATA_KEYS_FILE) {
    const { readFile } = await import('node:fs/promises');
    const raw = (await readFile(env.GUARDIAN_DATA_KEYS_FILE, 'utf8')).trim();
    return createFieldCrypto({ GUARDIAN_DATA_KEYS: raw });
  }
  return createFieldCrypto(env);
}

export function createFieldCrypto(env = process.env) {
  return createFieldCryptoFromKeys(loadKeys(env));
}

function createFieldCryptoFromKeys({ activeId, keys }) {

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
