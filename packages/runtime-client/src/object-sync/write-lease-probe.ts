import { storeWriteHeaders } from "./http-store-write-headers";

export type LeaseHolderState = "live" | "stale";

export type WriteLeaseVerdict =
  | { state: "held" }
  | { state: "fenced"; holder: LeaseHolderState }
  | { state: "unsupported" };

export interface WriteLeaseProbeOptions {
  baseUrl: string;
  token: string;
  bootId: string;
  fence: { token?: string };
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2_000;

export function createWriteLeaseProbe(
  opts: WriteLeaseProbeOptions,
): () => Promise<WriteLeaseVerdict> {
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/lease`;
  const fetchImpl = opts.fetchImpl ?? fetch;
  return async () => {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: storeWriteHeaders(
        { Authorization: `Bearer ${opts.token}` },
        undefined,
        { bootId: opts.bootId, fence: opts.fence, claim: undefined },
      ),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    const body = await res.text();
    if (res.ok) return { state: "held" };
    if (res.status === 409) {
      const live = /"holder"\s*:\s*"live"/.test(body);
      return { state: "fenced", holder: live ? "live" : "stale" };
    }
    if (res.status === 404 || res.status === 405)
      return { state: "unsupported" };
    throw new Error(`write lease check failed (${res.status})`);
  };
}
