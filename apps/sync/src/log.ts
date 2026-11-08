/**
 * Logging that is safe to run in a (possibly public) GitHub Actions log.
 * Every token/key handled at runtime must be passed to `mask()` first: Actions then redacts
 * it from all subsequent output, including output from other steps.
 */
import { appendFileSync } from 'node:fs';

const inActions = process.env.GITHUB_ACTIONS === 'true';

export function mask(secret: string | undefined | null): void {
  if (!secret || !inActions) return;
  // Mask each line separately; Actions masks line-by-line.
  for (const line of secret.split(/\r?\n/)) {
    if (line.trim()) process.stdout.write(`::add-mask::${line}\n`);
  }
}

export const log = {
  info: (msg: string) => process.stdout.write(`${msg}\n`),
  warn: (msg: string) => process.stdout.write(inActions ? `::warning::${msg}\n` : `WARN ${msg}\n`),
  error: (msg: string) => process.stdout.write(inActions ? `::error::${msg}\n` : `ERROR ${msg}\n`),
  group: (title: string) => inActions && process.stdout.write(`::group::${title}\n`),
  endGroup: () => inActions && process.stdout.write('::endgroup::\n'),
};

export function summary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${markdown}\n`);
  else log.info(markdown);
}

/** Short, non-identifying label for a playlist in public logs. */
export const shortId = (id: string) => `${id.slice(0, 4)}…`;
