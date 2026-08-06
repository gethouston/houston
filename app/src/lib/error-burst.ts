/**
 * Burst collapsing for the error-surfacing layer.
 *
 * One root cause fails N concurrent calls — a dozen queries all hitting the
 * same rejected bearer during a cloud deploy (HOU-687), every live query at
 * once when the device drops offline (HOU-1085) — and each of them reaches the
 * surfacing layer independently. Only the FIRST of such a burst is a distinct
 * event: the rest are the same problem, and re-toasting or re-counting them
 * misrepresents one outage as a dozen.
 *
 * Callers key on the DISPLAYED body rather than the raw diagnostic, so a burst
 * of technically distinct failures that all render the same generic copy also
 * collapses into one — which is exactly how a non-technical user experiences
 * it.
 *
 * Split out of `error-toast.ts` so the surviving decision stays unit-testable
 * once the error path stopped rendering toasts (HOU-1245): the module it came
 * from cannot be imported by `app/tests` (it pulls the engine-client barrel and
 * the Zustand store), this one is dependency-free.
 */

export const TOAST_DEDUPE_WINDOW_MS = 5_000;

export interface BurstGate {
  /**
   * True the first time `key` is seen, false for every repeat within the
   * window. A repeat also REFRESHES the window, so a sustained failure loop
   * stays collapsed instead of re-firing every `windowMs`.
   */
  isFirst(key: string, now: number): boolean;
}

export function createBurstGate(windowMs = TOAST_DEDUPE_WINDOW_MS): BurstGate {
  const seen = new Map<string, number>();
  return {
    isFirst(key: string, now: number): boolean {
      const last = seen.get(key);
      seen.set(key, now);
      // The map only ever holds keys from the current burst — evict as we go.
      for (const [k, at] of seen) {
        if (now - at > windowMs) seen.delete(k);
      }
      return last === undefined || now - last > windowMs;
    },
  };
}
