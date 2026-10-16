/**
 * The gate on starting anything that opens LinkedIn from the share dialog
 * (copy and paste, Connect LinkedIn). Pure: the clock is handed in.
 */

/** How long clicks on Share on LinkedIn are ignored after one settled. */
export const LINKEDIN_OPEN_COOLDOWN_MS = 1000;

/**
 * The gate on opening LinkedIn: one share at a time, and none within
 * {@link LINKEDIN_OPEN_COOLDOWN_MS} of the last one starting or settling.
 * Running one at a time is not enough: an open settles in a microtask, so a
 * double click (two event turns some 50 ms apart) opened two composers. The
 * first click runs the task synchronously, inside the click. Returns whether
 * the task started; a task that throws before returning its promise
 * releases the gate and the throw is rethrown.
 */
export function createLinkedInGate(
  now: () => number,
  cooldownMs = LINKEDIN_OPEN_COOLDOWN_MS,
) {
  let running = false;
  let last = Number.NEGATIVE_INFINITY;
  return (task: () => Promise<unknown>): boolean => {
    if (running || now() - last < cooldownMs) return false;
    running = true;
    last = now();
    const release = () => {
      running = false;
      last = now();
    };
    let pending: Promise<unknown>;
    try {
      pending = task();
    } catch (error) {
      release();
      throw error;
    }
    pending.then(release, release);
    return true;
  };
}
