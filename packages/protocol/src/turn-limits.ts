export interface TurnLimits {
  routineMinIntervalMinutes?: number;
}

const MAX_ROUTINE_MIN_INTERVAL_MINUTES = 1440;

function validFloor(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_ROUTINE_MIN_INTERVAL_MINUTES
  );
}

export function parseTurnLimits(value: unknown): TurnLimits | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const floor = (value as { routineMinIntervalMinutes?: unknown })
    .routineMinIntervalMinutes;
  return validFloor(floor) ? { routineMinIntervalMinutes: floor } : undefined;
}

export const ROUTINE_FLOOR_HEADER = "x-houston-routine-floor";

// WHY: Node joins repeated headers into one string; a garbled stamp is no floor, never a stricter one. ADR-0017
export function parseRoutineFloorHeader(
  value: string | string[] | undefined,
): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) return undefined;
  const floor = Number(raw.trim());
  return validFloor(floor) ? floor : undefined;
}
