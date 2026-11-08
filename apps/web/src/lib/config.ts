import { fromBase64Url, utf8 } from '@syncsaint/core';

function parsePublicKey(raw: string | undefined): JsonWebKey | null {
  if (!raw) return null;
  try {
    return JSON.parse(utf8.decode(fromBase64Url(raw))) as JsonWebKey;
  } catch {
    return null;
  }
}

export const config = {
  spotifyClientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined,
  tidalClientId: import.meta.env.VITE_TIDAL_CLIENT_ID as string | undefined,
  sealPublicKey: parsePublicKey(import.meta.env.VITE_SEAL_PUBLIC_KEY as string | undefined),
  adminName:
    (import.meta.env.VITE_ADMIN_NAME as string | undefined) || 'the person who sent you here',
  /** Must exactly match the redirect URI registered with Spotify and TIDAL. */
  redirectUri: `${window.location.origin}${import.meta.env.BASE_URL}`,
};

export const missingConfig = (): string[] =>
  [
    !config.spotifyClientId && 'VITE_SPOTIFY_CLIENT_ID',
    !config.tidalClientId && 'VITE_TIDAL_CLIENT_ID',
    !config.sealPublicKey && 'VITE_SEAL_PUBLIC_KEY',
  ].filter(Boolean) as string[];
