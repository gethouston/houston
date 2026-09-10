/**
 * A connect-poll read answered "this connection no longer exists"
 * (HOUSTON-APP-52Q / PRODUCT-1733).
 *
 * The poll (`pollConnectionUntilActive`) reads ONE connection by the id the
 * connect link was minted with, so `/v1/integrations/<provider>/connections/<id>`
 * has exactly one 404 path: the host's `connection not found`, answered when
 * the pending connection is gone. That happens for two expected reasons, and
 * neither is a Houston bug:
 *
 *  - the user disconnected the app while its OAuth was still pending (the
 *    disconnect removes every connection of the toolkit, the pending one
 *    included, and a poll already in flight lands after it);
 *  - the provider expired or revoked the pending connection before the user
 *    finished signing in.
 *
 * Either way the honest outcome is "the connect ended", so the read is
 * silenced (`call()` still logs it; no red bug toast, no Sentry report) and
 * the poll settles as `"gone"`. Like `isAgentGoneError`, the classifier keys
 * on the structural `.status`: the host emits a bare-string error body with
 * no typed `kind`, and both engine adapters (`HoustonEngineError`) carry the
 * status. Applied ONLY to the poll read; the disconnect write and the
 * connections list keep the default loud surfacing.
 */
export function isIntegrationConnectionGoneError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { status?: unknown }).status === 404;
}
