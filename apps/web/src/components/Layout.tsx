export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-10">
      <header className="mb-10 flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-9" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">SyncSaint</h1>
          <p className="text-sm text-zinc-500">Spotify → TIDAL, kept in sync.</p>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-12 text-xs text-zinc-500">
        Your Spotify password never touches SyncSaint. Revoke access any time at{' '}
        <a
          className="underline"
          href="https://www.spotify.com/account/apps/"
          rel="noreferrer"
          target="_blank"
        >
          spotify.com/account/apps
        </a>
        .
      </footer>
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  const styles =
    tone === 'error'
      ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
      : 'border-zinc-300 bg-white text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300';
  return <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 ${props.className ?? ''}`}
    />
  );
}
