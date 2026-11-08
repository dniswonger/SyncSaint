import { resolve } from 'node:path';
import { mask } from './log';

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export function loadEnv() {
  const privateKeyJson = required('SYNCSAINT_PRIVATE_KEY');
  const stateKey = required('SYNCSAINT_STATE_KEY');
  mask(privateKeyJson);
  mask(stateKey);
  let privateJwk: JsonWebKey;
  try {
    privateJwk = JSON.parse(privateKeyJson) as JsonWebKey;
  } catch {
    throw new Error('SYNCSAINT_PRIVATE_KEY must be a JWK JSON string (run `npm run keygen`)');
  }
  return {
    privateJwk,
    stateKey,
    spotifyClientId: required('SPOTIFY_CLIENT_ID'),
    tidalClientId: required('TIDAL_CLIENT_ID'),
    // `npm run -w` changes cwd to the workspace; INIT_CWD is where npm was invoked (repo root).
    stateFile: resolve(
      process.env.INIT_CWD ?? process.cwd(),
      process.env.STATE_FILE?.trim() || '.state/state.enc',
    ),
    force: process.env.SYNC_FORCE === 'true',
  };
}
export type Env = ReturnType<typeof loadEnv>;
