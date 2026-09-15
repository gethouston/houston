/**
 * How a spaces request fails, and the {@link HttpScope} it runs in.
 *
 * Kept beside the requests rather than inside them so `http.ts` holds the seven
 * gateway calls and nothing else.
 */

import type { HttpScope } from "../http";

/** A failed spaces request. `status` is the upstream HTTP status. */
export class SpacesHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SpacesHttpError";
  }
}

/**
 * The scope every spaces request runs in: the engine base (trailing slashes
 * trimmed), the injected ports, the shared 401 signal, and the error type a
 * caller catches.
 */
export function spacesScope(
  baseUrl: string,
  ports: HttpScope["ports"],
  onUnauthorized: () => void,
): HttpScope {
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    ports,
    onUnauthorized,
    fail: (message, status) =>
      new SpacesHttpError(
        message || `spaces request failed: ${status}`,
        status,
      ),
  };
}
