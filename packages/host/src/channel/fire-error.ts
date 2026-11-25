export class TurnFireError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly provider: string | null = null,
  ) {
    super(message);
    this.name = "TurnFireError";
  }

  static providerIn(body: string): string | null {
    try {
      const parsed: unknown = JSON.parse(body);
      if (parsed && typeof parsed === "object" && "provider" in parsed) {
        const provider = (parsed as { provider: unknown }).provider;
        if (typeof provider === "string" && provider) return provider;
      }
    } catch {}
    return null;
  }
}

export const TURN_BUSY_CODE = "turn_busy";

export class TurnBusyError extends TurnFireError {
  constructor(readonly runningConversation: string | null) {
    super("a turn is already running for this agent", 409, TURN_BUSY_CODE);
    this.name = "TurnBusyError";
  }
}

export function turnBusyError(
  runningConversation: string | null,
): TurnBusyError {
  return new TurnBusyError(runningConversation);
}

export function isTurnBusy(err: unknown): boolean {
  return err instanceof TurnFireError && err.code === TURN_BUSY_CODE;
}

export function isTurnBusyIn(err: unknown, conversationId: string): boolean {
  return (
    err instanceof TurnBusyError && err.runningConversation === conversationId
  );
}

export function errorCodeFrom(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "code" in parsed) {
      const code = (parsed as { code: unknown }).code;
      if (typeof code === "string" && code) return code;
    }
  } catch {}
  return null;
}

const DIAL_FAILURE_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED",
  "UND_ERR_CONNECT_TIMEOUT",
]);

// WHY: Only dial-time codes prove the POST never left; later failures may have started a turn. ADR-0016
export function isDialFailure(err: unknown): boolean {
  const code = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  return (
    err instanceof TypeError &&
    err.message === "fetch failed" &&
    typeof code === "string" &&
    DIAL_FAILURE_CODES.has(code)
  );
}

export class TurnDeliveryUncertainError extends Error {
  constructor(
    readonly reason: unknown,
    readonly hostShuttingDown = false,
  ) {
    const code = (reason as { cause?: { code?: unknown } } | null)?.cause?.code;
    const where = typeof code === "string" ? ` (${code})` : "";
    super(
      hostShuttingDown
        ? `the runtime connection failed mid-request${where} while the host shut down; retry shortly`
        : `the runtime connection failed mid-request${where}; the turn may have started`,
    );
    this.name = "TurnDeliveryUncertainError";
  }
}
