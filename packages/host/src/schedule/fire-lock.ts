/** The atomic primitive shared by every scheduled-routine fire path. */
export interface FireLock {
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
}

/** Canonical lock key for one routine's scheduled instant. */
export function routineFireLockKey(routineId: string, fireAt: Date): string {
  return `routine:fired:${routineId}:${fireAt.toISOString()}`;
}

/**
 * Burn a scheduled instant before consulting the routine busy gate. A false
 * result means another fire path already consumed this exact instant.
 */
export function burnRoutineFireInstant(
  lock: FireLock,
  routineId: string,
  fireAt: Date,
  ttlSec: number,
): Promise<boolean> {
  return lock.setNx(routineFireLockKey(routineId, fireAt), "1", ttlSec);
}
