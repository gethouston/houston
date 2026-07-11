/**
 * The adapter's single error type. Extracted from `client.ts` so the
 * control-plane modules and the mixins can import it without pulling in the
 * whole `HoustonClient` facade (which would create an import cycle through the
 * mixins). `client.ts` re-exports both names, so `@houston-ai/engine-client`'s
 * public surface (`HoustonEngineError`, `isHoustonEngineError`) is unchanged.
 */
export class HoustonEngineError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
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
