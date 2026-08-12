import { config } from "../config";
import { currentCredentialScope } from "../session/acting-context";
import type { ServedCredential } from "./auth-file";

/**
 * Central credential probes for serve mode (PRODUCT-1324 / HOUSTON-APP-4YV).
 *
 * `runServedSync` probes EVERY known provider against the control plane, on
 * every turn start and several hydrating routes. Fired all at once with no
 * retry, one transient socket failure became a Sentry ERROR per provider AND
 * silently un-applied that provider for the sync — a freshly recycled pod's
 * first turn could read a connected provider as not-connected. So probes here
 * are (a) capped to a small concurrency, (b) retried once after a short
 * backoff before an error is final, and (c) described with the nested undici
 * `cause` code (the part `err.message` — a bare "fetch failed" — loses).
 */

export type ServeProbe =
  | { id: string; state: "served"; cred: ServedCredential }
  | { id: string; state: "not-connected" }
  | { id: string; state: "error"; detail: string; timedOut?: boolean };

/**
 * Marker the host sets on its /sandbox/credential 404: the credential store's
 * own "not connected" answer. Only marked 404s are an authoritative logout —
 * a bare 404 (an old host, a mistyped control-plane URL, a route-level miss)
 * must never delete a working credential.
 */
const NOT_CONNECTED_HEADER = "x-houston-not-connected";

/** One stalled host/gateway socket must not hang every hydrating route. */
const SERVE_FETCH_TIMEOUT_MS = 10_000;

/** Short backoff before the single retry — a socket blip, not an outage. */
export const PROBE_RETRY_DELAY_MS = 250;

/**
 * How many probes run at once. ~40 concurrent sockets from a just-woken pod
 * were themselves a plausible source of the transient failures; a small pool
 * keeps the sweep to a few round-trips without the burst.
 */
export const PROBE_CONCURRENCY = 8;

/**
 * The first meaningful error code in a `cause` chain. undici wraps socket
 * failures as `TypeError: fetch failed` with the real `ECONNRESET`/`EAI_AGAIN`
 * on `cause` (sometimes an AggregateError of per-address connect failures) —
 * without this, the log and its Sentry event say only "fetch failed".
 */
function causeCode(err: unknown, depth = 0): string | undefined {
  if (!err || typeof err !== "object" || depth > 4) return undefined;
  const e = err as {
    code?: unknown;
    errno?: unknown;
    cause?: unknown;
    errors?: unknown[];
  };
  if (typeof e.code === "string" && e.code) return e.code;
  if (typeof e.errno === "number") return String(e.errno);
  if (Array.isArray(e.errors)) {
    for (const inner of e.errors) {
      const code = causeCode(inner, depth + 1);
      if (code) return code;
    }
  }
  return causeCode(e.cause, depth + 1);
}

/** A probe failure's log detail: the message plus the nested cause code. */
export function describeProbeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const code = causeCode(err.cause);
  return code ? `${err.message} (cause: ${code})` : err.message;
}

/** AbortSignal.timeout's rejection — a 10s stall, not a momentary blip. */
function isTimeout(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "TimeoutError" || err.name === "AbortError")
  );
}

/** One provider's central lookup — a single attempt. Never throws — an
 *  internal serve hiccup for ONE provider must not strand the others. */
async function probeOnce(id: string): Promise<ServeProbe> {
  // WHO this serve is for: the host forwards the acting-as token to the gateway,
  // which resolves personal-vs-team for THIS provider and reports its verdict
  // on the body. Absent → the team credential, exactly as before HOU-976.
  const { actingAs } = currentCredentialScope();
  try {
    const res = await fetch(
      `${config.controlPlaneUrl}/sandbox/credential?provider=${id}`,
      {
        headers: {
          Authorization: `Bearer ${config.sandboxToken}`,
          ...(actingAs ? { "x-houston-acting-as": actingAs } : {}),
        },
        signal: AbortSignal.timeout(SERVE_FETCH_TIMEOUT_MS),
      },
    );
    if (res.status === 404 && res.headers.get(NOT_CONNECTED_HEADER) === "1")
      return { id, state: "not-connected" };
    if (!res.ok)
      return {
        id,
        state: "error",
        detail: `${res.status}: ${await res.text().catch(() => "")}`,
      };
    return {
      id,
      state: "served",
      cred: (await res.json()) as ServedCredential,
    };
  } catch (err) {
    return {
      id,
      state: "error",
      detail: describeProbeError(err),
      timedOut: isTimeout(err),
    };
  }
}

/**
 * One provider's probe with a single retry. The first failure is a WARN
 * breadcrumb only — the error becomes final (and Sentry-visible via
 * serve-log.ts) when the retry fails too, so a one-off blip never alerts
 * while a persistent gateway outage still does. A TIMED-OUT first attempt is
 * final immediately: it already stalled the sync for 10s, a 250ms-later
 * second stall would not heal it, and the next sync re-probes anyway.
 */
export async function probeProvider(
  id: string,
  attempt: (id: string) => Promise<ServeProbe> = probeOnce,
  retryDelayMs: number = PROBE_RETRY_DELAY_MS,
): Promise<ServeProbe> {
  const first = await attempt(id);
  if (first.state !== "error" || first.timedOut) return first;
  console.warn(
    `[serve] credential ${id} probe failed, retrying once: ${first.detail}`,
  );
  await new Promise((r) => setTimeout(r, retryDelayMs));
  return attempt(id);
}

/**
 * Probe every id through a small worker pool (order-preserving). Results are
 * per-provider verdicts; a probe that fails both attempts stays an `error`
 * verdict — the caller keeps whatever it already applied and re-probes on the
 * next sync (an error must never remove a credential).
 */
export async function probeProviders(
  ids: string[],
  probe: (id: string) => Promise<ServeProbe> = probeProvider,
  concurrency: number = PROBE_CONCURRENCY,
): Promise<ServeProbe[]> {
  const results: ServeProbe[] = [];
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, ids.length)) },
    async () => {
      while (next < ids.length) {
        const index = next++;
        const id = ids[index];
        if (id !== undefined) results[index] = await probe(id);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
