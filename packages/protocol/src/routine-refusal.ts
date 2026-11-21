export const ROUTINE_NOT_FOUND = "routine_not_found";

export const ROUTINE_NOT_FOUND_REASON = "routine not found";

export function isRoutineNotFoundBody(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const value = body as { code?: unknown; error?: unknown };
  if (value.code === ROUTINE_NOT_FOUND) return true;
  return value.code === undefined && value.error === ROUTINE_NOT_FOUND_REASON;
}
