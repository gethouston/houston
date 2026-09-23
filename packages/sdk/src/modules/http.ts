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

import type { SdkPorts } from "../ports";

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
    baseUrl: ctx.config.baseUrl.replace(/\/+$/, ""),
    ports: ctx.config.ports,
    onUnauthorized: () => ctx.authExpiry.notifyExpired(),
    fail: (message, status) =>
      new Failure(message || `${family} request failed: ${status}`, status),
  };
}

/**
 * Issue one JSON request against `scope.baseUrl + path` and return the raw
 * `Response` on any 2xx; a non-2xx always throws (never a soft result).
 */
export async function httpRequest(
  scope: HttpScope,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await scope.ports.fetch(`${scope.baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    if (res.status === 401) scope.onUnauthorized();
    const body = await res.text().catch(() => "");
    throw scope.fail(body, res.status);
  }
  return res;
}
