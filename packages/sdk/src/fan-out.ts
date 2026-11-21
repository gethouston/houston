import type { Clock } from "./ports";

export const AGENT_FAN_OUT_LIMIT = 8;

export const FAN_OUT_SLOT_LEASE_MS = 2_000;

export interface FanOutSettleOptions {
  signal?: AbortSignal;
}

export interface FanOutGate {
  run<T>(read: () => Promise<T>, opts?: FanOutSettleOptions): Promise<T>;
  settle<I, T>(
    items: readonly I[],
    read: (item: I) => Promise<T>,
    opts?: FanOutSettleOptions,
  ): Promise<PromiseSettledResult<T>[]>;
}

export function createFanOutGate({
  limit = AGENT_FAN_OUT_LIMIT,
  leaseMs = FAN_OUT_SLOT_LEASE_MS,
  timers = globalTimers,
}: {
  limit?: number;
  leaseMs?: number;
  timers?: Pick<Clock, "setTimeout" | "clearTimeout">;
} = {}): FanOutGate {
  if (!(limit >= 1)) throw new RangeError(`fan-out limit must be >= 1`);
  let active = 0;
  const waiting: Array<() => void> = [];

  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };

  const acquire = (signal?: AbortSignal): Promise<void> => {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (active < limit) {
      active++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        const at = waiting.indexOf(grant);
        if (at >= 0) waiting.splice(at, 1);
        reject(signal?.reason);
      };
      const grant = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      waiting.push(grant);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  };

  const run = async <T>(
    read: () => Promise<T>,
    opts?: FanOutSettleOptions,
  ): Promise<T> => {
    await acquire(opts?.signal);
    let held = true;
    const free = () => {
      if (!held) return;
      held = false;
      release();
    };
    const lease = timers.setTimeout(free, leaseMs);
    try {
      return await read();
    } finally {
      timers.clearTimeout(lease);
      free();
    }
  };

  return {
    run,
    settle: (items, read, opts) =>
      Promise.allSettled(items.map((item) => run(() => read(item), opts))),
  };
}

const globalTimers: Pick<Clock, "setTimeout" | "clearTimeout"> = {
  setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id) => clearTimeout(id),
};
