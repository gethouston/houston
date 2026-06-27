import { describe, expect, test } from "vitest";
import type { TurnBus } from "../turn/bus";

/**
 * The TurnBus CONTRACT, run verbatim against every adapter — the anti-drift net
 * for the shared-state port that makes the cloudrun turn path replica-safe.
 * Everything the relay, the one-turn-per-agent gate, the quota counters, and the
 * device-code connect state ride on this surface, so the two impls (in-process
 * MemoryTurnBus, cross-replica RedisTurnBus) must agree on: pub/sub fan-out +
 * unsubscribe, key set/get/del with TTL, the setNx mutex + lease renew via
 * expire, and atomic incr/decr with creation TTL.
 *
 * Exported from `@houston/host` (OPEN) so BOTH the open adapter suite
 * (turn/bus.contract.test.ts: MemoryTurnBus, virtual clock) AND the closed
 * adapter suite in `@houston/host-cloud` (turn/bus-redis.contract.test.ts:
 * RedisTurnBus against ioredis-mock) run the SAME assertions.
 *
 * TIME: the contract is parameterized by a `make(now)` so impls with a virtual
 * clock (MemoryTurnBus) can prove TTL expiry deterministically. An impl with no
 * injectable clock (Redis) passes the non-time assertions verbatim and drives
 * the time-dependent ones against Redis's NATIVE EX/NX/TTL (see the host-cloud
 * suite).
 */
export function runTurnBusContract(
  name: string,
  make: (now: () => number) => TurnBus,
): void {
  describe(`TurnBus contract: ${name}`, () => {
    test("publish fans out to every subscriber; unsubscribe stops delivery", async () => {
      const bus = make(() => 0);
      const a: string[] = [];
      const b: string[] = [];
      const unsubA = bus.subscribe("ch", (m) => a.push(m));
      bus.subscribe("ch", (m) => b.push(m));
      await bus.publish("ch", "one");
      unsubA();
      await bus.publish("ch", "two");
      // Delivery order per channel is the publish order.
      expect(a).toEqual(["one"]);
      expect(b).toEqual(["one", "two"]);
    });

    test("channels are isolated — a publish reaches only that channel's subscribers", async () => {
      const bus = make(() => 0);
      const got: string[] = [];
      bus.subscribe("ch-a", (m) => got.push(`a:${m}`));
      bus.subscribe("ch-b", (m) => got.push(`b:${m}`));
      await bus.publish("ch-a", "1");
      await bus.publish("ch-b", "2");
      expect(got).toEqual(["a:1", "b:2"]);
    });

    test("get/set/del round-trip with TTL expiry", async () => {
      let t = 0;
      const bus = make(() => t);
      await bus.set("k", "v", 5);
      expect(await bus.get("k")).toBe("v");
      t += 5_001; // TTL lapses
      expect(await bus.get("k")).toBeNull();

      await bus.set("k", "v2", 5);
      await bus.del("k");
      expect(await bus.get("k")).toBeNull();
    });

    test("get on a never-set key is null", async () => {
      const bus = make(() => 0);
      expect(await bus.get("nope")).toBeNull();
    });

    test("setNx is a mutex; expire renews the lease; the TTL frees a crashed owner", async () => {
      let t = 0;
      const bus = make(() => t);
      expect(await bus.setNx("lock", "1", 10)).toBe(true); // acquired
      expect(await bus.setNx("lock", "1", 10)).toBe(false); // held
      t += 9_000;
      await bus.expire("lock", 10); // heartbeat: lease renewed at 9s
      t += 9_000; // 18s total, still held thanks to the renew
      expect(await bus.setNx("lock", "1", 10)).toBe(false);
      t += 10_001; // lease lapsed (owner crashed, no more heartbeats) → free
      expect(await bus.setNx("lock", "1", 10)).toBe(true);
    });

    test("incr creates with TTL, counts atomically; decr reverses; the counter resets after TTL", async () => {
      let t = 0;
      const bus = make(() => t);
      expect(await bus.incr("n", 60)).toBe(1); // creates with a 60s TTL
      expect(await bus.incr("n", 60)).toBe(2);
      expect(await bus.decr("n")).toBe(1);
      t += 60_001; // TTL set at creation → the counter lapses
      expect(await bus.incr("n", 60)).toBe(1);
    });
  });
}
