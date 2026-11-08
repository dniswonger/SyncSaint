import { useEffect, useState } from 'react';
import { ConnectTidal } from './components/ConnectTidal';
import { Layout, Notice } from './components/Layout';
import { ShareSpotify } from './components/ShareSpotify';
import { missingConfig } from './lib/config';
import { completeLoginFromUrl, type CallbackResult } from './lib/oauth';

type View = 'share' | 'tidal';
const viewFromHash = (): View => (window.location.hash === '#/tidal' ? 'tidal' : 'share');

export function App() {
  const [view, setView] = useState<View>(viewFromHash);
  const [login, setLogin] = useState<CallbackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    completeLoginFromUrl()
      .then((res) => {
        if (!res) return;
        setLogin(res);
        setView(res.provider === 'tidal' ? 'tidal' : 'share');
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const missing = missingConfig();
  if (missing.length) {
    return (
      <Layout>
        <Notice tone="error">
          This SyncSaint deployment isn't configured yet. Missing: {missing.join(', ')}.
        </Notice>
      </Layout>
    );
  }

  return (
    <Layout>
      {error && <Notice tone="error">{error}</Notice>}
      {busy ? (
        <p className="text-zinc-500">Finishing sign-in…</p>
      ) : view === 'tidal' ? (
        <ConnectTidal login={login?.provider === 'tidal' ? login : null} />
      ) : (
        <ShareSpotify login={login?.provider === 'spotify' ? login : null} />
      )}
    </Layout>
  );
}
