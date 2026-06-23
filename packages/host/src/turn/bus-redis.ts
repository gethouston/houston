import { Redis } from "ioredis";
import type { TurnBus } from "./bus";

/**
 * Redis-backed TurnBus (CP_REDIS_URL) — the piece that unlocks `replicas: 2+`
 * on the control plane. Two connections: ioredis puts a connection in
 * subscriber mode once SUBSCRIBE is issued, so commands ride `cmd` and
 * subscriptions ride `sub`.
 *
 * Failure policy: command failures (set/get/incr/...) reject and surface
 * through the calling request. Subscription-plumbing failures have no request
 * to reject, so they log loudly with context — the relay's "turn ended
 * unexpectedly" synthesis is the user-facing backstop (mirrors the engine's
 * event-emit exception in CLAUDE.md).
 */
export class RedisTurnBus implements TurnBus {
  private readonly cmd: Redis;
  private readonly sub: Redis;
  private handlers = new Map<string, Set<(message: string) => void>>();

  constructor(url: string) {
    this.cmd = new Redis(url);
    this.sub = new Redis(url);
    this.sub.on("message", (channel: string, message: string) => {
      for (const h of [...(this.handlers.get(channel) ?? [])]) h(message);
    });
    for (const conn of [this.cmd, this.sub]) {
      conn.on("error", (err: Error) =>
        console.error("[bus:redis] connection error:", err.message),
      );
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.cmd.publish(channel, message);
  }

  subscribe(channel: string, handler: (message: string) => void): () => void {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      this.sub
        .subscribe(channel)
        .catch((err: Error) =>
          console.error(
            `[bus:redis] subscribe ${channel} failed:`,
            err.message,
          ),
        );
    }
    set.add(handler);
    return () => {
      const s = this.handlers.get(channel);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) {
        this.handlers.delete(channel);
        this.sub
          .unsubscribe(channel)
          .catch((err: Error) =>
            console.error(
              `[bus:redis] unsubscribe ${channel} failed:`,
              err.message,
            ),
          );
      }
    };
  }

  async set(key: string, value: string, ttlSec: number): Promise<void> {
    await this.cmd.set(key, value, "EX", ttlSec);
  }

  async get(key: string): Promise<string | null> {
    return this.cmd.get(key);
  }

  async del(key: string): Promise<void> {
    await this.cmd.del(key);
  }

  async setNx(key: string, value: string, ttlSec: number): Promise<boolean> {
    return (await this.cmd.set(key, value, "EX", ttlSec, "NX")) === "OK";
  }

  async expire(key: string, ttlSec: number): Promise<void> {
    await this.cmd.expire(key, ttlSec);
  }

  async incr(key: string, ttlSec: number): Promise<number> {
    const n = await this.cmd.incr(key);
    if (n === 1) await this.cmd.expire(key, ttlSec);
    return n;
  }

  async decr(key: string): Promise<number> {
    return this.cmd.decr(key);
  }
}
