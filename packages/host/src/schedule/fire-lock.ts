export interface FireLock {
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
}

export function routineFireLockKey(routineId: string, fireAt: Date): string {
  return `routine:fired:${routineId}:${fireAt.toISOString()}`;
}

export function burnRoutineFireInstant(
  lock: FireLock,
  routineId: string,
  fireAt: Date,
  ttlSec: number,
  value = "1",
): Promise<boolean> {
  return lock.setNx(routineFireLockKey(routineId, fireAt), value, ttlSec);
}
