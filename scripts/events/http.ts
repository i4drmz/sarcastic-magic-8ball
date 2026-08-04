import { sleep } from './utils';

const DEFAULT_UA =
  'PulseEvents/1.0 (+https://github.com/i4drmz/sarcastic-magic-8ball; RSS events pipeline; contact via GitHub issues)';

const DEFAULT_GAP_MS = 250;

export async function fetchText(
  url: string,
  opts: {
    accept?: string;
    gapMs?: number;
    headers?: Record<string, string>;
  } = {},
): Promise<{ ok: boolean; status: number; text: string; url: string }> {
  await sleep(opts.gapMs ?? DEFAULT_GAP_MS);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: opts.accept ?? 'text/html,application/json;q=0.9,*/*;q=0.8',
      ...opts.headers,
    },
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text, url };
}

export async function fetchJson<T>(
  url: string,
  opts: { gapMs?: number; headers?: Record<string, string> } = {},
): Promise<{ ok: boolean; status: number; data: T | null; text: string; url: string }> {
  const result = await fetchText(url, {
    accept: 'application/json',
    gapMs: opts.gapMs,
    headers: opts.headers,
  });
  if (!result.ok) {
    return { ok: false, status: result.status, data: null, text: result.text, url };
  }
  try {
    return {
      ok: true,
      status: result.status,
      data: JSON.parse(result.text) as T,
      text: result.text,
      url,
    };
  } catch {
    return { ok: false, status: result.status, data: null, text: result.text, url };
  }
}
