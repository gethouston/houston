import { trimTrailingSlashes } from "./trim-slashes";
import type { EngineClientConfig } from "./types";

export class EngineError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`engine request failed (${status}): ${body}`);
    this.name = "EngineError";
  }
}

export interface Requester {
  request(path: string, init?: RequestInit): Promise<Response>;
  json<T>(path: string, init?: RequestInit): Promise<T>;
}

export function createRequester(config: EngineClientConfig): Requester {
  const base = trimTrailingSlashes(config.baseUrl);
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
