/**
 * The single HTTP seam for the SDK's own REST modules (agents, activities).
 *
 * Those modules talk to host routes the runtime client doesn't cover, and they
 * all need the same four behaviors: join the engine base, send JSON, turn a
 * `401` into the shared auth-expiry signal, and turn any other non-2xx into the
 * calling module's own error type (carried by {@link HttpScope.fail}, so a
 * caller still catches `AgentsHttpError` / `ActivitiesHttpError`).
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
