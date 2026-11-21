export interface IdleWatchdogOptions {
  idleTimeoutMs: number;
  now: () => number;
  onStall: () => void;
}

export interface IdleWatchdog {
  touch(): void;
  silentMs(): number;
  stop(): void;
}

export function startIdleWatchdog(opts: IdleWatchdogOptions): IdleWatchdog {
  const { idleTimeoutMs, now, onStall } = opts;
  const sweepMs = Math.min(5_000, Math.max(20, Math.ceil(idleTimeoutMs / 4)));
  const lateMs = 2 * sweepMs;
  let lastActivity = now();
  let countingSince = lastActivity;
  let lastSweep = lastActivity;
  const timer = setInterval(() => {
    const at = now();
    const slept = at - lastSweep > lateMs;
    lastSweep = at;
    if (slept) {
      countingSince = at;
      return;
    }
    if (at - Math.max(lastActivity, countingSince) > idleTimeoutMs) onStall();
  }, sweepMs);

  return {
    touch: () => {
      lastActivity = now();
    },
    silentMs: () => now() - lastActivity,
    stop: () => clearInterval(timer),
  };
}
