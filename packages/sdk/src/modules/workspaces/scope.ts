/**
 * How a workspaces request fails, and the {@link HttpScope} it runs in.
 *
 * Kept beside the requests rather than inside them so `http.ts` holds the seven
 * host calls and nothing else.
 */

import type { HttpScope } from "../http";

/** A failed workspaces request. `status` is the upstream HTTP status. */
export class WorkspacesHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "WorkspacesHttpError";
  }
}

/**
 * The scope every workspaces request runs in: the engine base (trailing slashes
 * trimmed), the injected ports, the shared 401 signal, and the error type a
 * caller catches.
 *
 * Callers that DEGRADE on a status (a host that predates a route answering 404)
 * catch it themselves: this layer never softens a failure into an empty result,
 * because a surface that cannot tell "nothing there" from "could not ask" shows
 * the user a lie.
 */
export function workspacesScope(
  baseUrl: string,
  ports: HttpScope["ports"],
  onUnauthorized: () => void,
): HttpScope {
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    ports,
    onUnauthorized,
    fail: (message, status) =>
      new WorkspacesHttpError(
        message || `workspaces request failed: ${status}`,
        status,
      ),
  };
}
