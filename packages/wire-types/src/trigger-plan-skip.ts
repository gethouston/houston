export const TRIGGER_PLAN_SKIP_CODES = [
  "plan_min_interval",
  "plan_routine_limit",
  "plan_inactive",
] as const;

export type TriggerPlanSkipCode = (typeof TRIGGER_PLAN_SKIP_CODES)[number];

export interface TriggerPlanSkipped {
  code: TriggerPlanSkipCode;
  count: number;
  last_at: string;
}

function isSkipCode(value: unknown): value is TriggerPlanSkipCode {
  return (
    typeof value === "string" &&
    (TRIGGER_PLAN_SKIP_CODES as readonly string[]).includes(value)
  );
}

export function parseTriggerPlanSkipped(
  value: unknown,
): TriggerPlanSkipped | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (
    !isSkipCode(raw.code) ||
    typeof raw.count !== "number" ||
    !Number.isInteger(raw.count) ||
    raw.count < 1 ||
    typeof raw.last_at !== "string" ||
    !Number.isFinite(Date.parse(raw.last_at))
  )
    return null;
  return { code: raw.code, count: raw.count, last_at: raw.last_at };
}
