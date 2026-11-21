import { gatewayReason } from "../engine-waking-error";

export class HoustonEngineError extends Error {
  public status: number;
  public body: unknown;
  public retryAfterMs?: number;
  public agentId?: string;

  constructor(status: number, body: unknown, retryAfterMs?: number) {
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
    this.retryAfterMs = retryAfterMs;
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

export const SIGNED_OUT_ERROR = "signed_out";

export function isSignedOutEngineError(e: unknown): boolean {
  if (isHoustonEngineError(e)) {
    return (
      e.status === 401 &&
      (e.body as { error?: unknown } | null)?.error === SIGNED_OUT_ERROR
    );
  }
  if (!(e instanceof Error) || e.name !== "EngineError") return false;
  const { status, body } = e as { status?: unknown; body?: unknown };
  return (
    status === 401 &&
    typeof body === "string" &&
    gatewayReason(body) === SIGNED_OUT_ERROR
  );
}
