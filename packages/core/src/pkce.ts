import { randomBytes, toBase64Url, utf8 } from './encoding';

export function createCodeVerifier(): string {
  return toBase64Url(randomBytes(64)); // 86 chars, within RFC 7636's 43–128
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8.encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

export function createState(): string {
  return toBase64Url(randomBytes(24));
}
