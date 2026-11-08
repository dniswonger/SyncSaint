export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    // Never include request headers/body in the message: they may hold tokens.
    super(`HTTP ${status} from ${new URL(url).origin}${new URL(url).pathname}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with retries for rate limiting (429, honouring Retry-After) and transient 5xx.
 * Returns parsed JSON, or undefined for empty responses.
 */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  { retries = 4 }: { retries?: number } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) {
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new HttpError(res.status, url, (await res.text()).slice(0, 500));
    }
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
    await sleep(Math.min(wait, 60_000));
  }
}

export function formBody(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}
