/**
 * The single HTTP seam for the SDK's own REST modules.
 *
 * A module comes through here for every host route the runtime client cannot
 * reach: that client is rooted at ONE agent's sandbox, so anything account-,
 * space-, or agent-list-shaped has no sub-client to ride. They all need the
 * same four behaviors: join the engine base, send JSON, turn a `401` into the
 * shared auth-expiry signal, and turn any other non-2xx into the calling
 * module's own error type (carried by {@link HttpScope.fail}, so a caller still
 * catches `AgentsHttpError` / `ActivitiesHttpError`).
 *
 * Call sites MUST pass a RELATIVE path built from string literals and
 * `encodeURIComponent(<parameter>)` — the base lives in the scope and never in
 * the template. The in-app assistant's operation catalog is derived statically
 * from those literals, so a path assembled from a runtime value (a `root`
 * variable, a helper that folds the base in) is invisible to it and the
 * operation silently disappears from what the assistant can do.
 */

import { trimTrailingSlashes } from "@houston/runtime-client/trim-slashes";
import { parseComputeRefusalText, retryAfterMsOf } from "@houston/wire-types";
import type { Clock, SdkPorts } from "../ports";

/** Everything {@link httpRequest} needs that is constant for one module. */
export interface HttpScope {
  /** The engine base, already stripped of trailing slashes. */
  baseUrl: string;
  ports: SdkPorts;
  onUnauthorized: () => void;
  /** Wraps a non-2xx into the calling module's own error type. */
  fail: (message: string, status: number) => Error;
}

/**
 * The base every module's `*HttpError` extends. `status` is the upstream HTTP
 * status, so a caller that wants to degrade on one (a gateway predating a route
 * answering `404`) reads it and decides for itself.
 *
 * Each subclass passes its own `name` as a string literal instead of letting
 * the base read `new.target.name`: Vite (esbuild) minifies the production
 * bundle and mangles class names, and surfaces branch on `err.name`.
 */
export class SdkHttpError extends Error {
  /**
   * The refusal's `Retry-After`, in milliseconds, when it carried a readable
   * one. Stamped by {@link httpRequest} after the module's `fail` builds the
   * error, so no subclass constructor has to thread it.
   */
  retryAfterMs: number | undefined = undefined;

  constructor(
    message: string,
    readonly status: number,
    name: string,
  ) {
    super(message);
    this.name = name;
  }
}

/**
 * The kernel collaborators a scope is built from. A full `ModuleContext`
 * satisfies it; the narrow shape is what lets a wire test build a scope from a
 * stub `fetch` alone.
 */
export interface ScopeContext {
  config: { baseUrl: string; ports: SdkPorts };
  authExpiry: { notifyExpired(): void };
}

/**
 * The scope one module's requests all ride: the engine base (trailing slashes
 * trimmed), the injected ports, the shared 401 signal, and `fail` bound to that
 * module's own error class so a caller catches ONE class per family. `family`
 * names the module in the fallback message an empty error body leaves behind
 * ("org request failed: 500").
 *
 * Nothing is softened here — a non-2xx always throws. A caller that wants a
 * degradation reads the status and decides, because a surface that cannot tell
 * "nothing there" from "could not ask" shows the user a lie.
 */
export function moduleScope(
  ctx: ScopeContext,
  family: string,
  Failure: new (message: string, status: number) => SdkHttpError,
): HttpScope {
  return {
    baseUrl: trimTrailingSlashes(ctx.config.baseUrl),
    ports: ctx.config.ports,
    onUnauthorized: () => ctx.authExpiry.notifyExpired(),
    fail: (message, status) =>
      new Failure(message || `${family} request failed: ${status}`, status),
  };
}

/**
 * Total pause across one request's re-sends after the gateway's typed
 * "nothing ran, send it again" refusals (`compute_busy`, `pod_wake_refused`,
 * `@houston/wire-types` compute-refusal): the same budget a board write rides
 * out a busy agent with (`activities/busy-retry.ts`).
 */
export const COMPUTE_RETRY_BUDGET_MS = 20_000;
/** The pause when a refusal names none, and its floor. */
const COMPUTE_RETRY_DEFAULT_MS = 2_000;
const COMPUTE_RETRY_MIN_MS = 500;

/**
 * Issue one JSON (or multipart) request against `scope.baseUrl + path` and return the raw
 * `Response` on any 2xx; a non-2xx always throws (never a soft result). A
 * write's typed compute refusal is sent again, the same request, within
 * {@link COMPUTE_RETRY_BUDGET_MS}: the gateway answers it only when nothing
 * ran, so a re-send can never apply a write twice.
 */
export async function httpRequest(
  scope: HttpScope,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let paused = 0;
  // A multipart body sets its own Content-Type, boundary included.
  const multipart =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  for (;;) {
    const res = await scope.ports.fetch(`${scope.baseUrl}${path}`, {
      ...init,
      headers: multipart
        ? init?.headers
        : { "Content-Type": "application/json", ...init?.headers },
    });
    if (res.ok) return res;
    if (res.status === 401) scope.onUnauthorized();
    const body = await res.text().catch(() => "");
    const retryAfterMs = retryAfterMsOf(res.headers);
    const pause = computeRetryPause(res.status, body, retryAfterMs, init);
    if (pause !== undefined && paused + pause <= COMPUTE_RETRY_BUDGET_MS) {
      paused += pause;
      await sleep(scope.ports.clock, pause);
      continue;
    }
    const err = scope.fail(body, res.status);
    if (err instanceof SdkHttpError) err.retryAfterMs = retryAfterMs;
    throw err;
  }
}

/** The pause before re-sending a compute refusal, or undefined for any other. */
function computeRetryPause(
  status: number,
  body: string,
  retryAfterMs: number | undefined,
  init: RequestInit | undefined,
): number | undefined {
  // Only a body fetch can send again: a stream is spent by the first try. A
  // read keeps the one retry it already has: the host's fetch transport rides
  // a waking ladder for GET and HEAD (the web adapter's transientRetryFetch),
  // and a second ladder here would stack on it.
  const method = (init?.method ?? "GET").toUpperCase();
  if (
    status !== 503 ||
    method === "GET" ||
    method === "HEAD" ||
    !(init?.body == null || typeof init.body === "string")
  )
    return undefined;
  const refusal = parseComputeRefusalText(body);
  if (!refusal) return undefined;
  const hint = refusal.retryAfterMs ?? retryAfterMs ?? COMPUTE_RETRY_DEFAULT_MS;
  return Math.max(COMPUTE_RETRY_MIN_MS, hint);
}

function sleep(clock: Clock, ms: number): Promise<void> {
  return new Promise<void>((resolve) => clock.setTimeout(resolve, ms));
}
