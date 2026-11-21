export const LINKEDIN_OPEN_COOLDOWN_MS = 1000;

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
