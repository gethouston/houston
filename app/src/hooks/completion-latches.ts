export interface LatchTimers {
  set: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: (handle: ReturnType<typeof setTimeout>) => void;
}

interface Latch {
  agentPath: string;
  ready: () => boolean;
  send: () => void;
  timer: ReturnType<typeof setTimeout>;
}

const defaultTimers: LatchTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle),
};

export class CompletionLatches {
  private readonly map = new Map<string, Latch>();
  private readonly graceMs: number;
  private readonly timers: LatchTimers;

  constructor(graceMs: number, timers: LatchTimers = defaultTimers) {
    this.graceMs = graceMs;
    this.timers = timers;
  }

  latch(
    agentPath: string,
    sessionKey: string,
    ready: () => boolean,
    send: () => void,
  ): void {
    const key = `${agentPath}::${sessionKey}`;
    const existing = this.map.get(key);
    if (existing) this.timers.clear(existing.timer);
    const timer = this.timers.set(() => this.fire(key, true), this.graceMs);
    this.map.set(key, { agentPath, ready, send, timer });
  }

  fireForAgent(agentPath: string): void {
    for (const [key, entry] of [...this.map]) {
      if (entry.agentPath === agentPath) this.fire(key, false);
    }
  }

  dispose(): void {
    for (const entry of this.map.values()) this.timers.clear(entry.timer);
    this.map.clear();
  }

  private fire(key: string, force: boolean): void {
    const entry = this.map.get(key);
    if (!entry) return;
    if (!force && !entry.ready()) return;
    this.timers.clear(entry.timer);
    this.map.delete(key);
    entry.send();
  }
}
