import { describe, expect, it } from 'vitest';
import {
  decryptState,
  encryptState,
  generateRecipientKeys,
  generateStateKey,
  seal,
  unseal,
} from './crypto';

describe('sealed link codes', () => {
  it('round-trips a value', async () => {
    const keys = await generateRecipientKeys();
    const code = await seal(keys.publicJwk, { hello: 'world' });
    expect(code.startsWith('ss1.')).toBe(true);
    expect(await unseal(keys.privateJwk, code)).toEqual({ hello: 'world' });
  });

  it('rejects the wrong key', async () => {
    const a = await generateRecipientKeys();
    const b = await generateRecipientKeys();
    const code = await seal(a.publicJwk, { secret: 1 });
    await expect(unseal(b.privateJwk, code)).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const keys = await generateRecipientKeys();
    const code = await seal(keys.publicJwk, { secret: 1 });
    const tampered = code.slice(0, -2) + (code.endsWith('A') ? 'BB' : 'AA');
    await expect(unseal(keys.privateJwk, tampered)).rejects.toThrow();
  });
});

describe('state encryption', () => {
  it('round-trips and uses a fresh IV each time', async () => {
    const key = generateStateKey();
    const a = await encryptState(key, { n: 1 });
    const b = await encryptState(key, { n: 1 });
    expect(a).not.toEqual(b);
    expect(await decryptState(key, a)).toEqual({ n: 1 });
  });

  it('fails with a different key', async () => {
    const blob = await encryptState(generateStateKey(), { n: 1 });
    await expect(decryptState(generateStateKey(), blob)).rejects.toThrow();
  });
});
