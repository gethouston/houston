export const ASSISTANT_GATEWAY_ONLY = "assistant_gateway_only";
export const ASSISTANT_UNAVAILABLE = "assistant_unavailable";
export const ASSISTANT_NOT_CONFIGURED = "not_configured";

const UNSUPPORTED_CODES: ReadonlySet<string> = new Set([
  ASSISTANT_GATEWAY_ONLY,
  ASSISTANT_UNAVAILABLE,
  ASSISTANT_NOT_CONFIGURED,
]);

const ABSENCE_STATUSES: ReadonlySet<number> = new Set([404, 501, 503]);

export type AssistantDiscoveryFailure =
  | { readonly kind: "unsupported" }
  | { readonly kind: "transient"; readonly retryAfterMs: number | null }
  | { readonly kind: "unexpected" };

function errorCode(body: unknown): string | undefined {
  const b = body as { code?: unknown; error?: { code?: unknown } } | null;
  if (typeof b?.code === "string") return b.code;
  const nested = b?.error?.code;
  return typeof nested === "string" ? nested : undefined;
}

function retryHint(err: object): number | null {
  const hint = (err as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof hint === "number" && Number.isFinite(hint) && hint > 0
    ? hint
    : null;
}

export function classifyAssistantDiscoveryFailure(
  err: unknown,
): AssistantDiscoveryFailure {
  if (!err || typeof err !== "object") return { kind: "unexpected" };
  const { status, body } = err as { status?: unknown; body?: unknown };
  if (typeof status !== "number" || !ABSENCE_STATUSES.has(status)) {
    return { kind: "unexpected" };
  }
  const code = errorCode(body);
  if (code !== undefined && UNSUPPORTED_CODES.has(code)) {
    return { kind: "unsupported" };
  }
  if (status === 503)
    return { kind: "transient", retryAfterMs: retryHint(err) };
  return { kind: "unsupported" };
}

export function isAssistantUnavailableError(err: unknown): boolean {
  return classifyAssistantDiscoveryFailure(err).kind !== "unexpected";
}
