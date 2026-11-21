import {
  type PlanMinIntervalRefusal,
  parsePlanMinIntervalRefusal,
} from "@houston/protocol/plan-min-interval";

export function planMinIntervalRefusal(
  error: unknown,
): PlanMinIntervalRefusal | null {
  if (!(error instanceof Error)) return null;
  const { status, body } = error as { status?: unknown; body?: unknown };
  if (status !== 400) return null;
  const payload = body === undefined ? error.message : body;
  if (typeof payload !== "string") return parsePlanMinIntervalRefusal(payload);
  try {
    return parsePlanMinIntervalRefusal(JSON.parse(payload));
  } catch {
    return null;
  }
}

export function isPlanMinIntervalRefusal(error: unknown): boolean {
  return planMinIntervalRefusal(error) !== null;
}
