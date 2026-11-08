/**
 * Two kinds of encryption, both built only on WebCrypto (browser + Node, no dependencies):
 *
 * 1. Sealed "link codes" (asymmetric). The web app encrypts a freshly minted refresh token to
 *    SyncSaint's public key, so the token never exists in plaintext outside the owner's browser
 *    and the GitHub Actions runner. Scheme: ephemeral ECDH P-256 -> HKDF-SHA256 -> AES-256-GCM.
 *
 * 2. The sync state file (symmetric, AES-256-GCM) holding refresh tokens and playlist mappings,
 *    stored in git. Even if the state branch/repo leaked, it's useless without the key secret.
 */
import { fromBase64Url, randomBytes, toBase64Url, utf8 } from './encoding';

const subtle = globalThis.crypto.subtle;
const SEAL_PREFIX = 'ss1.';
const STATE_PREFIX = 'ssstate1.';
const SEAL_INFO = utf8.encode('SyncSaint link code v1');

export interface RecipientKeys {
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey;
}

export async function generateRecipientKeys(): Promise<RecipientKeys> {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  return {
    publicJwk: await subtle.exportKey('jwk', pair.publicKey),
    privateJwk: await subtle.exportKey('jwk', pair.privateKey),
  };
}

async function deriveSealKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const shared = await subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdfKey = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: SEAL_INFO },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const importPublic = (jwk: JsonWebKey) =>
  subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
const importPrivate = (jwk: JsonWebKey) =>
  subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);

/** Encrypt a JSON value so only the holder of the recipient private key can read it. */
export async function seal(recipientPublicJwk: JsonWebKey, value: unknown): Promise<string> {
  const recipient = await importPublic(recipientPublicJwk);
  const eph = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ephRaw = new Uint8Array(await subtle.exportKey('raw', eph.publicKey)); // 65 bytes
  const iv = randomBytes(12);
  const key = await deriveSealKey(eph.privateKey, recipient, ephRaw);
  const ct = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: ephRaw },
      key,
      utf8.encode(JSON.stringify(value)),
    ),
  );
  return SEAL_PREFIX + [ephRaw, iv, ct].map(toBase64Url).join('.');
}

export async function unseal(recipientPrivateJwk: JsonWebKey, code: string): Promise<unknown> {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SEAL_PREFIX)) throw new Error('Not a SyncSaint link code');
  const parts = trimmed.slice(SEAL_PREFIX.length).split('.');
  if (parts.length !== 3) throw new Error('Malformed link code');
  const [ephRaw, iv, ct] = parts.map(fromBase64Url) as [
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>,
  ];
  const ephPublic = await subtle.importKey(
    'raw',
    ephRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const key = await deriveSealKey(await importPrivate(recipientPrivateJwk), ephPublic, ephRaw);
  let pt: ArrayBuffer;
  try {
    pt = await subtle.decrypt({ name: 'AES-GCM', iv, additionalData: ephRaw }, key, ct);
  } catch {
    throw new Error(
      'Link code could not be decrypted (copied incompletely, or made for another SyncSaint)',
    );
  }
  return JSON.parse(utf8.decode(new Uint8Array(pt)));
}

// ---- Symmetric state encryption ----

export function generateStateKey(): string {
  return toBase64Url(randomBytes(32));
}

const importStateKey = (keyB64: string) => {
  const raw = fromBase64Url(keyB64);
  if (raw.length !== 32) throw new Error('State key must be 32 bytes (base64url)');
  return subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
};

export async function encryptState(keyB64: string, value: unknown): Promise<string> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(
    await subtle.encrypt(
      { name: 'AES-GCM', iv },
      await importStateKey(keyB64),
      utf8.encode(JSON.stringify(value)),
    ),
  );
  return `${STATE_PREFIX}${toBase64Url(iv)}.${toBase64Url(ct)}\n`;
}

export async function decryptState(keyB64: string, blob: string): Promise<unknown> {
  const trimmed = blob.trim();
  if (!trimmed.startsWith(STATE_PREFIX)) throw new Error('Not a SyncSaint state file');
  const [iv, ct] = trimmed.slice(STATE_PREFIX.length).split('.').map(fromBase64Url);
  if (!iv || !ct) throw new Error('Malformed state file');
  let pt: ArrayBuffer;
  try {
    pt = await subtle.decrypt({ name: 'AES-GCM', iv }, await importStateKey(keyB64), ct);
  } catch {
    throw new Error('State file could not be decrypted (wrong SYNCSAINT_STATE_KEY?)');
  }
  return JSON.parse(utf8.decode(new Uint8Array(pt)));
}
