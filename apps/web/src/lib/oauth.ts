/**
 * OAuth 2.0 Authorization Code + PKCE, entirely in the browser (no client secret anywhere).
 * The verifier lives in sessionStorage only for the redirect round-trip; tokens live only in
 * memory and are sealed before they leave this page.
 */
import {
  createCodeChallenge,
  createCodeVerifier,
  createState,
  spotifyAuthorizeUrl,
  spotifyExchangeCode,
  tidalAuthorizeUrl,
  tidalExchangeCode,
} from '@syncsaint/core';
import { config } from './config';

export type Provider = 'spotify' | 'tidal';
const KEY = 'syncsaint.oauth';

interface Pending {
  provider: Provider;
  state: string;
  verifier: string;
}

export async function startLogin(provider: Provider): Promise<void> {
  const verifier = createCodeVerifier();
  const state = createState();
  sessionStorage.setItem(KEY, JSON.stringify({ provider, state, verifier } satisfies Pending));
  const opts = {
    redirectUri: config.redirectUri,
    codeChallenge: await createCodeChallenge(verifier),
    state,
  };
  window.location.assign(
    provider === 'spotify'
      ? spotifyAuthorizeUrl({ ...opts, clientId: config.spotifyClientId! })
      : tidalAuthorizeUrl({ ...opts, clientId: config.tidalClientId! }),
  );
}

export interface CallbackResult {
  provider: Provider;
  accessToken: string;
  refreshToken: string;
  userId?: string;
}

let inFlight: Promise<CallbackResult | null> | null = null;

/** Completes a login if the URL carries an OAuth callback. Safe to call more than once. */
export function completeLoginFromUrl(): Promise<CallbackResult | null> {
  inFlight ??= (async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    const returnedState = params.get('state');
    if (!code && !error) return null;

    // Strip the code from the address bar and history immediately.
    window.history.replaceState(null, '', config.redirectUri + window.location.hash);
    const pending = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Pending | null;
    sessionStorage.removeItem(KEY);

    if (error) throw new Error(`Login was cancelled or denied (${error})`);
    if (!pending || pending.state !== returnedState) {
      throw new Error('Login state mismatch; please start again');
    }
    const args = { redirectUri: config.redirectUri, code: code!, codeVerifier: pending.verifier };
    const tokens =
      pending.provider === 'spotify'
        ? await spotifyExchangeCode({ ...args, clientId: config.spotifyClientId! })
        : await tidalExchangeCode({ ...args, clientId: config.tidalClientId! });
    return { provider: pending.provider, ...tokens };
  })();
  return inFlight;
}

export function pendingProvider(): Provider | null {
  const pending = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Pending | null;
  return pending?.provider ?? null;
}
