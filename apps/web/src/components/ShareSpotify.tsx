import {
  SpotifyClient,
  seal,
  type SpotifyOwnerLink,
  type SpotifySimplePlaylist,
} from '@syncsaint/core';
import { useEffect, useState } from 'react';
import { config } from '../lib/config';
import { startLogin, type CallbackResult } from '../lib/oauth';
import { Button, Notice } from './Layout';
import { LinkCode } from './LinkCode';

interface Loaded {
  me: { id: string; displayName: string };
  playlists: SpotifySimplePlaylist[];
}

export function ShareSpotify({ login }: { login: CallbackResult | null }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!login) return;
    const client = new SpotifyClient(login.accessToken);
    Promise.all([client.me(), client.myReadablePlaylists()])
      .then(([me, playlists]) => setData({ me, playlists }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [login]);

  if (!login) {
    return (
      <section className="space-y-5">
        <h2 className="text-2xl font-semibold tracking-tight">Share your Spotify playlists</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          {config.adminName} wants to keep a copy of some of your playlists on TIDAL. Sign in with
          Spotify, pick the playlists to share, and send back the code this page gives you.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Read-only: SyncSaint can see your playlists but can't change anything.</li>
          <li>Only the playlists you tick are synced.</li>
          <li>
            Your Spotify account must first be added to the app's allow-list by {config.adminName}.
          </li>
        </ul>
        <Button
          className="bg-spotify! text-black! hover:brightness-95"
          onClick={() => startLogin('spotify')}
        >
          Continue with Spotify
        </Button>
      </section>
    );
  }

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <p className="text-zinc-500">Loading your playlists…</p>;

  if (code) {
    return (
      <LinkCode
        code={code}
        instructions={
          <>
            All set, {data.me.displayName}. Send this code to <strong>{config.adminName}</strong>{' '}
            (text or email is fine). You can close this page afterwards.
          </>
        }
      />
    );
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const generate = async () => {
    const payload: SpotifyOwnerLink = {
      kind: 'spotify-owner',
      version: 1,
      createdAt: new Date().toISOString(),
      owner: {
        spotifyUserId: data.me.id,
        displayName: data.me.displayName,
        refreshToken: login.refreshToken,
      },
      playlists: data.playlists
        .filter((p) => selected.has(p.id))
        .map((p) => ({ id: p.id, name: p.name })),
    };
    setCode(await seal(config.sealPublicKey!, payload));
  };

  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-semibold tracking-tight">Pick playlists to share</h2>
      {data.playlists.length === 0 ? (
        <Notice tone="info">
          No playlists found that you own or collaborate on. Spotify only lets SyncSaint read those.
        </Notice>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {data.playlists.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <input
                  type="checkbox"
                  className="size-4 accent-zinc-900 dark:accent-white"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                />
                {p.images?.[0] ? (
                  <img src={p.images[0].url} alt="" className="size-10 rounded object-cover" />
                ) : (
                  <div className="size-10 rounded bg-zinc-200 dark:bg-zinc-800" />
                )}
                <span className="truncate">{p.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <Button disabled={selected.size === 0 || selected.size > 50} onClick={generate}>
        Create code for {selected.size || 'no'} playlist{selected.size === 1 ? '' : 's'}
      </Button>
    </section>
  );
}
