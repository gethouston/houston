/**
 * The integrations module's own HTTP seam.
 *
 * `IntegrationsClient` (runtime-client) serves the composio-only routes the
 * reactive facade reads. The gateway also serves a provider-parameterised read
 * family (`/v1/integrations/{provider}/…`) and the whole user-added custom
 * connector surface, neither of which a sub-client models — those go over
 * {@link httpRequest}, the transport the assistant catalog reads path literals
 * from, under this module's own error type so a caller catches ONE class.
 *
 * Errors never get swallowed: a non-2xx throws an {@link IntegrationsHttpError}
 * carrying the HTTP `status`, and a `401` additionally fires `onUnauthorized`
 * so a lapsed session token becomes a visible `tokenExpired` signal.
 */

import type { SdkPorts } from "../../ports";
import type { HttpScope } from "../http";

/** A failed integrations request. `status` is the upstream HTTP status. */
export class IntegrationsHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "IntegrationsHttpError";
  }
}

/** The scope every integrations request function in this module is issued on. */
export function createIntegrationsScope(
  baseUrl: string,
  ports: SdkPorts,
  onUnauthorized: () => void,
): HttpScope {
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    ports,
    onUnauthorized,
    fail: (message, status) =>
      new IntegrationsHttpError(
        message || `integrations request failed: ${status}`,
        status,
      ),
  };
}
