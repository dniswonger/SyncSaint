import { seal, type TidalAccountLink } from '@syncsaint/core';
import { useState } from 'react';
import { config } from '../lib/config';
import { startLogin, type CallbackResult } from '../lib/oauth';
import { Button } from './Layout';
import { LinkCode } from './LinkCode';

/** Admin-only page (#/tidal): connect the TIDAL account that owns the mirrored playlists. */
export function ConnectTidal({ login }: { login: CallbackResult | null }) {
  const [country, setCountry] = useState('US');
  const [code, setCode] = useState<string | null>(null);

  if (!login) {
    return (
      <section className="space-y-5">
        <h2 className="text-2xl font-semibold tracking-tight">Connect your TIDAL account</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Admin setup. SyncSaint will create and update playlists in this TIDAL account.
        </p>
        <Button onClick={() => startLogin('tidal')}>Continue with TIDAL</Button>
      </section>
    );
  }

  if (code) {
    return (
      <LinkCode
        code={code}
        instructions={
          <>
            Run the <strong>Add link</strong> workflow in GitHub Actions and paste this code as its
            input.
          </>
        }
      />
    );
  }

  const generate = async () => {
    const payload: TidalAccountLink = {
      kind: 'tidal-account',
      version: 1,
      createdAt: new Date().toISOString(),
      countryCode: country.toUpperCase(),
      refreshToken: login.refreshToken,
      ...(login.userId ? { userId: login.userId } : {}),
    };
    setCode(await seal(config.sealPublicKey!, payload));
  };

  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-semibold tracking-tight">TIDAL connected</h2>
      <label className="block text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Catalog country (two-letter code)</span>
        <input
          value={country}
          maxLength={2}
          onChange={(e) => setCountry(e.target.value.replace(/[^a-z]/gi, ''))}
          className="mt-1 block w-24 rounded-lg border border-zinc-300 bg-white px-3 py-2 uppercase dark:border-zinc-800 dark:bg-zinc-900"
        />
      </label>
      <Button disabled={country.length !== 2} onClick={generate}>
        Create link code
      </Button>
    </section>
  );
}
