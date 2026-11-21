export type ComputeRefusalCode = "compute_busy" | "pod_wake_refused";

export interface ComputeRefusal {
  code: ComputeRefusalCode;
  error: string;
  detail?: string;
  retryAfterMs?: number;
}

const CODES: readonly string[] = ["compute_busy", "pod_wake_refused"];

export function parseComputeRefusal(body: unknown): ComputeRefusal | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as Record<string, unknown>;
  if (
    typeof value.code !== "string" ||
    !CODES.includes(value.code) ||
    typeof value.error !== "string"
  )
    return null;
  const refusal: ComputeRefusal = {
    code: value.code as ComputeRefusalCode,
    error: value.error,
  };
  if (typeof value.detail === "string") refusal.detail = value.detail;
  if (
    typeof value.retryAfterMs === "number" &&
    Number.isFinite(value.retryAfterMs) &&
    value.retryAfterMs >= 0
  )
    refusal.retryAfterMs = value.retryAfterMs;
  return refusal;
}

export function parseComputeRefusalText(text: string): ComputeRefusal | null {
  try {
    return parseComputeRefusal(JSON.parse(text));
  } catch {
    return null;
  }
}
