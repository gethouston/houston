/**
 * How a teams request fails, and the {@link HttpScope} it runs in.
 *
 * Kept beside the requests rather than inside them so the three request files
 * hold the fourteen gateway calls and nothing else.
 */

import type { HttpScope } from "../http";

/** A failed teams request. `status` is the upstream HTTP status. */
export class TeamsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TeamsHttpError";
  }
}

/**
 * The scope every teams request runs in: the engine base (trailing slashes
 * trimmed), the injected ports, the shared 401 signal, and the error type a
 * caller catches.
 */
export function teamsScope(
  baseUrl: string,
  ports: HttpScope["ports"],
  onUnauthorized: () => void,
): HttpScope {
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    ports,
    onUnauthorized,
    fail: (message, status) =>
      new TeamsHttpError(message || `teams request failed: ${status}`, status),
  };
}
