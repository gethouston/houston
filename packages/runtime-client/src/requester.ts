import type { EngineClientConfig } from "./types";

/** A non-2xx response from the engine. `status` is the upstream HTTP status;
 *  `body` is the raw response text (empty when unreadable). */
export class EngineError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`engine request failed (${status}): ${body}`);
    this.name = "EngineError";
  }
}

/**
 * The shared fetch plumbing every runtime-client class is built on: base-URL
 * joining, bearer auth, non-2xx → {@link EngineError}, and JSON decoding. A
 * single implementation so the conversation client and the user-scoped
 * integration/preference clients cannot drift in how they talk to the engine.
 */
export interface Requester {
  /** Issue a request; throws {@link EngineError} on a non-2xx response. */
  request(path: string, init?: RequestInit): Promise<Response>;
  /** Issue a request and decode its JSON body. */
  json<T>(path: string, init?: RequestInit): Promise<T>;
}

/** Build a {@link Requester} from an {@link EngineClientConfig}. */
export function createRequester(config: EngineClientConfig): Requester {
  const base = config.baseUrl.replace(/\/+$/, "");
  const token = config.token;
  const fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);

  const headers = (extra?: Record<string, string>): Record<string, string> => {
    const h: Record<string, string> = { ...extra };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  };

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetchImpl(base + path, {
      ...init,
      headers: headers(init?.headers as Record<string, string>),
    });
    if (!res.ok)
      throw new EngineError(res.status, await res.text().catch(() => ""));
    return res;
  }

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    return (await request(path, init)).json() as Promise<T>;
  }

  return { request, json };
}
