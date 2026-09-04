/**
 * Process-wide drain latch. Set the moment a shutdown signal lands and never
 * cleared: from then on the runtime finishes the turns it holds and refuses
 * new ones, so a pod restart, a sleep, or a host shutdown can end a turn only
 * by letting it complete (or by the caller's hard deadline), never by cutting
 * it mid tool-call. Read by the turn-start route (503 + Retry-After, the same
 * "not now" shape the host answers while its launcher is closed, which the
 * clients already treat as a wake, not an error) and by `/busy`, so the host's
 * activity probe reads a draining runtime as busy until it is gone.
 */
let draining = false;

export function beginDrain(): void {
  draining = true;
}

export function isDraining(): boolean {
  return draining;
}

/** Test seam: the latch is module state and vitest reuses the module. */
export function resetDrainForTests(): void {
  draining = false;
}
