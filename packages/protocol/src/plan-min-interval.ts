export const PLAN_MIN_INTERVAL = "plan_min_interval";

export interface PlanMinIntervalRefusal {
  error: string;
  code: typeof PLAN_MIN_INTERVAL;
  minIntervalMinutes: number;
}

export function parsePlanMinIntervalRefusal(
  body: unknown,
): PlanMinIntervalRefusal | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as Record<string, unknown>;
  const minutes = value.minIntervalMinutes;
  if (
    value.code !== PLAN_MIN_INTERVAL ||
    typeof value.error !== "string" ||
    typeof minutes !== "number" ||
    !Number.isInteger(minutes) ||
    minutes < 1
  )
    return null;
  return {
    error: value.error,
    code: PLAN_MIN_INTERVAL,
    minIntervalMinutes: minutes,
  };
}
