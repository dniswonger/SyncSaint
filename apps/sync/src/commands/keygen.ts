/**
 * Generate SyncSaint's keys.
 *
 *   npm run keygen -- --repo <owner>/<repo>   # writes secrets/variables straight into GitHub via `gh`
 *   npm run keygen                            # prints them instead (handle with care)
 *
 * - SYNCSAINT_PRIVATE_KEY (secret):   opens link codes sealed by the web app
 * - SYNCSAINT_STATE_KEY (secret):     encrypts the state file
 * - SEAL_PUBLIC_KEY (variable):       baked into the web app so it can seal link codes
 */
import { spawnSync } from 'node:child_process';
import { generateRecipientKeys, generateStateKey, toBase64Url, utf8 } from '@syncsaint/core';
import { log } from '../log';

const repoFlag = process.argv.indexOf('--repo');
const repo = repoFlag >= 0 ? process.argv[repoFlag + 1] : undefined;

const keys = await generateRecipientKeys();
const privateKey = JSON.stringify(keys.privateJwk);
const publicKey = toBase64Url(utf8.encode(JSON.stringify(keys.publicJwk)));
const stateKey = generateStateKey();

function gh(kind: 'secret' | 'variable', name: string, value: string) {
  // Value goes over stdin, never argv, so it doesn't show up in `ps` or shell history.
  const res = spawnSync('gh', [kind, 'set', name, '--repo', repo!], {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (res.status !== 0) throw new Error(`gh ${kind} set ${name} failed`);
}

if (repo) {
  gh('secret', 'SYNCSAINT_PRIVATE_KEY', privateKey);
  gh('secret', 'SYNCSAINT_STATE_KEY', stateKey);
  gh('variable', 'SEAL_PUBLIC_KEY', publicKey);
  log.info(`Keys stored in ${repo}. The private keys were never printed.`);
  log.info('Note: rotating these makes existing state and unused link codes unreadable.');
} else {
  log.info('# Store these as GitHub Actions *secrets*:');
  log.info(`SYNCSAINT_PRIVATE_KEY=${privateKey}`);
  log.info(`SYNCSAINT_STATE_KEY=${stateKey}`);
  log.info('\n# Store this as a GitHub Actions *variable* (public):');
  log.info(`SEAL_PUBLIC_KEY=${publicKey}`);
}
