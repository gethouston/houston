import { capturePodFence, type PodGatewayConfig } from "../pod-gateway";

const RETRYABLE = new Set([502, 503, 504]);

export class ShadowUnavailableError extends Error {
  constructor(detail: string, cause?: unknown) {
    super(detail, cause === undefined ? undefined : { cause });
    this.name = "ShadowUnavailableError";
  }
}

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
