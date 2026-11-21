export const TOAST_DEDUPE_WINDOW_MS = 5_000;

export interface BurstGate {
  isFirst(key: string, now: number): boolean;
}

export function createBurstGate(windowMs = TOAST_DEDUPE_WINDOW_MS): BurstGate {
  const seen = new Map<string, number>();
  return {
    isFirst(key: string, now: number): boolean {
      const last = seen.get(key);
      seen.set(key, now);
      for (const [k, at] of seen) {
        if (now - at > windowMs) seen.delete(k);
      }
      return last === undefined || now - last > windowMs;
    },
  };
}
