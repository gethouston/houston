export interface TurnBus {
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: (message: string) => void): () => void;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<void>;
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
  expire(key: string, ttlSec: number): Promise<void>;
  incr(key: string, ttlSec: number): Promise<number>;
  decr(key: string): Promise<number>;
}

interface MemoryEntry {
  value: string | number;
  expiresAt: number;
}

export class MemoryTurnBus implements TurnBus {
  private entries = new Map<string, MemoryEntry>();
  private handlers = new Map<string, Set<(message: string) => void>>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private live(key: string): MemoryEntry | null {
    const e = this.entries.get(key);
    if (!e) return null;
    if (e.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return e;
  }

  async publish(channel: string, message: string): Promise<void> {
    for (const h of [...(this.handlers.get(channel) ?? [])]) h(message);
  }

  subscribe(channel: string, handler: (message: string) => void): () => void {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);
    return () => {
      const s = this.handlers.get(channel);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) this.handlers.delete(channel);
    };
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: this.now() + ttlSec * 1000 });
  }

  async get(key: string): Promise<string | null> {
    const e = this.live(key);
    return e === null ? null : String(e.value);
  }

  async del(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async setNx(key: string, value: string, ttlSec: number): Promise<boolean> {
    if (this.live(key)) return false;
    this.entries.set(key, { value, expiresAt: this.now() + ttlSec * 1000 });
    return true;
  }

  async expire(key: string, ttlSec: number): Promise<void> {
    const e = this.live(key);
    if (e) e.expiresAt = this.now() + ttlSec * 1000;
  }

  async incr(key: string, ttlSec: number): Promise<number> {
    const e = this.live(key);
    const next = (e ? Number(e.value) : 0) + 1;
    this.entries.set(key, {
      value: next,
      expiresAt: e ? e.expiresAt : this.now() + ttlSec * 1000,
    });
    return next;
  }

  async decr(key: string): Promise<number> {
    const e = this.live(key);
    const next = (e ? Number(e.value) : 0) - 1;
    this.entries.set(key, {
      value: next,
      expiresAt: e ? e.expiresAt : this.now() + 60_000,
    });
    return next;
  }
}
