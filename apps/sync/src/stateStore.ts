import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { StateSchema, decryptState, emptyState, encryptState, type State } from '@syncsaint/core';
import { mask } from './log';

// Plaintext of what's currently on disk. Encryption uses a fresh IV each time, so without this
// every run would produce a new ciphertext (and a new commit) even when nothing changed.
let lastWritten: string | null = null;

export async function loadState(file: string, key: string): Promise<State> {
  if (!existsSync(file)) return emptyState();
  const state = StateSchema.parse(await decryptState(key, await readFile(file, 'utf8')));
  // Mask every stored token before anything else can print it.
  mask(state.tidal?.refreshToken);
  for (const owner of Object.values(state.owners)) mask(owner.refreshToken);
  lastWritten = JSON.stringify(state);
  return state;
}

/** Atomic write so a crash mid-write can't corrupt the only copy of the refresh tokens. */
export async function saveState(file: string, key: string, state: State): Promise<void> {
  const parsed = StateSchema.parse(state);
  const plaintext = JSON.stringify(parsed);
  if (plaintext === lastWritten) return;
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, await encryptState(key, parsed), { mode: 0o600 });
  await rename(tmp, file);
  lastWritten = plaintext;
}
