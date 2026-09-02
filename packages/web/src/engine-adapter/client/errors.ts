/**
 * The adapter's single error type. Extracted from `client.ts` so the
 * control-plane modules and the mixins can import it without pulling in the
 * whole `HoustonClient` facade (which would create an import cycle through the
 * mixins). `client.ts` re-exports both names, so `@houston-ai/engine-client`'s
 * public surface (`HoustonEngineError`, `isHoustonEngineError`) is unchanged.
 */
export class HoustonEngineError extends Error {
  public status: number;
  public body: unknown;
  /** The agent a per-agent gateway route (`/agents/:id/*`) was scoped to,
   *  stamped by `cpFetch`; absent for every other route. The error-surfacing
   *  layer keys its per-agent stuck-wake tracker on it (PRODUCT-1640). */
  public agentId?: string;

  constructor(status: number, body: unknown) {
    // Carry the host's own explanation into the message: the v3 host answers
    // errors as `{error: "reason"}` (some routes as `{error: {message}}`).
    // Dropping it here would reduce every failure to "engine error <status>"
    // in the toast/log/Sentry report — the status code without the reason.
    const detail = (body as { error?: unknown } | null)?.error;
    const reason =
      typeof detail === "string"
        ? detail
        : typeof (detail as { message?: unknown } | null)?.message === "string"
          ? (detail as { message: string }).message
          : undefined;
    super(
      reason ? `${reason} (engine error ${status})` : `engine error ${status}`,
    );
    this.name = "HoustonEngineError";
    this.status = status;
    this.body = body;
  }
  get code(): string | undefined {
    return (this.body as { error?: { code?: string } })?.error?.code;
  }
  get kind(): string | undefined {
    return (this.body as { error?: { kind?: string } })?.error?.kind;
  }
}

export function isHoustonEngineError(e: unknown): e is HoustonEngineError {
  return e instanceof HoustonEngineError;
}

/**
 * The synthetic body `gatewayAuthFetch` answers with when a hosted call is
 * attempted with no session at all (signed out, or mid account-switch). No
 * network request is made for these.
 */
export const SIGNED_OUT_ERROR = "signed_out";

/**
 * True for the adapter's synthetic signed-out 401. Signed-out is an EXPECTED
 * lifecycle state — the sign-in screen is the surface — so callers use this to
 * skip the error-toast/report path a real failure would take.
 */
export function isSignedOutEngineError(e: unknown): boolean {
  return (
    isHoustonEngineError(e) &&
    e.status === 401 &&
    (e.body as { error?: unknown } | null)?.error === SIGNED_OUT_ERROR
  );
}
