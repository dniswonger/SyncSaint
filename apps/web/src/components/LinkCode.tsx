import { useState } from 'react';
import { Button } from './Layout';

export function LinkCode({ code, instructions }: { code: string; instructions: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="space-y-4">
      <div className="text-sm text-zinc-600 dark:text-zinc-400">{instructions}</div>
      <textarea
        readOnly
        value={code}
        onFocus={(e) => e.currentTarget.select()}
        className="h-36 w-full resize-none rounded-lg border border-zinc-300 bg-white p-3 font-mono text-xs break-all dark:border-zinc-800 dark:bg-zinc-900"
      />
      <Button onClick={copy}>{copied ? 'Copied ✓' : 'Copy code'}</Button>
      <p className="text-xs text-zinc-500">
        The code is encrypted. Only the SyncSaint sync job can open it, and it expires after 14
        days.
      </p>
    </div>
  );
}
