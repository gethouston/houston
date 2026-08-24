import { capturePodFence, type PodGatewayConfig } from "../pod-gateway";

const RETRYABLE = new Set([502, 503, 504]);

/**
 * The gateway answered 5xx (or did not answer) through every retry. Transient
 * by contract — the transcript store is rebooting or its schema migration has
 * not landed yet — and the shadow is a projection the next publish re-sends,
 * so callers log a warning and move on, never a Sentry error.
 */
export class ShadowUnavailableError extends Error {
  constructor(detail: string, cause?: unknown) {
    super(detail, cause === undefined ? undefined : { cause });
    this.name = "ShadowUnavailableError";
  }
}

/**
 * Fetch with the pod-gateway retry ladder (mirrors HttpTurnLogSender): 5xx
 * and thrown fetch failures retry on a short backoff; any other status
 * returns to the caller for its own classification. `init` is a factory so
 * each attempt gets a fresh AbortSignal.
 */
export async function shadowFetch(opts: {
  fetchImpl: typeof fetch;
  gateway: PodGatewayConfig;
  url: string;
  init: () => RequestInit;
  retryDelaysMs: number[];
}): Promise<Response> {
  let lastFailure: unknown;
  for (let attempt = 0; attempt <= opts.retryDelaysMs.length; attempt++) {
    try {
      const response = await opts.fetchImpl(opts.url, opts.init());
      capturePodFence(opts.gateway, response);
      if (!RETRYABLE.has(response.status)) return response;
      lastFailure = new ShadowUnavailableError(
        `gateway answered ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    } catch (error) {
      lastFailure = error;
    }
    const delay = opts.retryDelaysMs[attempt];
    if (delay === undefined) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw lastFailure instanceof ShadowUnavailableError
    ? lastFailure
    : new ShadowUnavailableError("gateway unreachable", lastFailure);
}
