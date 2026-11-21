const TRANSIENT_STATUSES = new Set([502, 503, 504]);

const WRAPPED_TRANSIENT_BODY = /\bgot HTTP response code (?:502|503|504)\b/;

async function isTransientResponse(res: Response): Promise<boolean> {
  if (TRANSIENT_STATUSES.has(res.status)) return true;
  if (res.status !== 500) return false;
  try {
    return WRAPPED_TRANSIENT_BODY.test(await res.clone().text());
  } catch {
    return false;
  }
}

export const DEFAULT_RETRY_DELAYS_MS = [500, 2000];

export interface FetchRetryOptions {
  retryable?: boolean;
  delaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  body?: () => BodyInit;
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit | undefined,
  opts: FetchRetryOptions = {},
): Promise<Response> {
  const delays =
    opts.retryable === false ? [] : (opts.delaysMs ?? DEFAULT_RETRY_DELAYS_MS);
  const sleep = opts.sleep ?? realSleep;
  for (let attempt = 0; ; attempt += 1) {
    const lastAttempt = attempt >= delays.length;
    try {
      const attemptInit = opts.body ? { ...init, body: opts.body() } : init;
      const res = await fetchImpl(url, attemptInit);
      if (lastAttempt || !(await isTransientResponse(res))) return res;
    } catch (err) {
      if (init?.signal?.aborted) throw err;
      if (lastAttempt) throw err;
    }
    if (init?.signal?.aborted) throw init.signal.reason;
    await sleep(delays[attempt] ?? 0);
  }
}
