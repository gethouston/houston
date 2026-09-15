/**
 * The one boundary that makes an `@houston/sdk` call indistinguishable from the
 * `cpFetch` call it replaces.
 *
 * The SDK's transports mint their own error classes — `modules/http.ts` throws
 * whatever `HttpScope.fail(message, status)` returns (`AgentsHttpError` and
 * friends), the runtime-client sub-clients throw `EngineError` — and both carry
 * the response body as TEXT. The app catches `HoustonEngineError`: the 404
 * degradations read `.status`, `isSignedOutEngineError` reads the PARSED
 * `body.error`, and `provider-agent-gone.ts` reads `.agentId`. Translating at
 * every delegation site would mean twelve near-copies of this, so every mixin
 * that delegates wraps its call in {@link viaSdk} instead.
 *
 * Two deltas against `cpFetch` remain, both by construction:
 *
 * - `retryAfterMs` is absent. It is read off the response's `Retry-After`
 *   header at the throw site, and the SDK's errors keep no headers. Every
 *   scheduler that reads it already falls back to its own backoff when the
 *   responder exposed no hint (`client/errors.ts`), so a delegated read
 *   degrades to that fallback rather than misreporting a wait.
 * - The stuck-wake tracker is fed here, not by the transport: {@link viaSdk}
 *   calls `wakingStuckTracker.noteSuccess` on a per-agent path exactly as
 *   `cpFetch` does (`cp/fetch.ts`), which is why callers pass the path.
 */

// The barrel, never `cp/fetch` directly: the web suite mocks
// `…/control-plane` wholesale and a submodule import would bypass the mock.
import { agentIdOfPath } from "../control-plane";
import { wakingStuckTracker } from "../waking-stuck-tracker";
import { HoustonEngineError } from "./errors";

/** An SDK transport failure: an `Error` stamped with the upstream HTTP status. */
function statusOf(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

/**
 * The response body the SDK kept. `EngineError` holds it on `.body`; the
 * `modules/http.ts` families pass it as the message. Parsed as JSON because
 * that is what `HoustonEngineError` consumers index into — a body that is not
 * JSON (an intermediary's HTML error page) becomes `{}`, exactly as `cpFetch`
 * resolves an unparseable body.
 */
function bodyOf(err: Error): unknown {
  const raw = (err as { body?: unknown }).body;
  const text = typeof raw === "string" ? raw : err.message;
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * The SDK's error for `path`, as the `HoustonEngineError` the app expects.
 * Anything that is not a status-bearing transport failure (a programming
 * error, an abort) passes through untouched — wrapping it would invent an HTTP
 * status that never existed.
 */
export function toHoustonEngineError(err: unknown, path: string): unknown {
  if (err instanceof HoustonEngineError) return err;
  const status = statusOf(err);
  if (status === null) return err;
  const translated = new HoustonEngineError(status, bodyOf(err as Error));
  const agentId = agentIdOfPath(path);
  if (agentId) translated.agentId = agentId;
  return translated;
}

/**
 * Run one delegated SDK call against `path` with `cpFetch`'s observable
 * behavior: a per-agent success ends that agent's stuck-wake episode, and a
 * failure surfaces as a {@link HoustonEngineError}.
 *
 * `path` is the request path the call issues, spelled as the SDK builds it —
 * the caller knows it, the error does not carry it, and it is the only source
 * for the agent id both behaviors key on.
 */
export async function viaSdk<T>(
  path: string,
  call: () => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    result = await call();
  } catch (err) {
    throw toHoustonEngineError(err, path);
  }
  // A per-agent call landing is the one signal that ends a stuck-wake episode
  // (PRODUCT-1640): the pod answered, whatever it was doing before.
  const agentId = agentIdOfPath(path);
  if (agentId) wakingStuckTracker.noteSuccess(agentId);
  return result;
}
