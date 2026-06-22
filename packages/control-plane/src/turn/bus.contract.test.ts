import { describe, expect, test } from "bun:test";
import type { TurnBus } from "./bus";
import { MemoryTurnBus } from "./bus";

/**
 * The TurnBus CONTRACT, run verbatim against every locally-testable adapter —
 * the anti-drift net for the shared-state port that makes the cloudrun turn path
 * replica-safe. Everything the relay, the one-turn-per-agent gate, the quota
 * counters, and the device-code connect state ride on this surface, so the two
 * impls (in-process MemoryTurnBus, cross-replica RedisTurnBus) must agree on:
 * pub/sub fan-out + unsubscribe, key set/get/del with TTL, the setNx mutex +
 * lease renew via expire, and atomic incr/decr with creation TTL.
 *
 * TIME: the contract is parameterized by a `make(now)` so impls with a virtual
 * clock (MemoryTurnBus) can prove TTL expiry deterministically. An impl with no
 * injectable clock (Redis) passes the non-time assertions and documents the
 * time-dependent ones as covered by Redis itself (its native EX/NX/TTL).
 *
 * NOT CONTRACT-TESTED LOCALLY:
 *   - RedisTurnBus (turn/bus-redis.ts) needs a live Redis (CP_REDIS_URL). It is
 *     a thin pass-through to Redis primitives (SET EX / SET NX EX / INCR+EXPIRE /
 *     SUBSCRIBE) whose semantics this contract pins on the reference impl; only
 *     a Redis integration run can prove the wire mapping. Marked with a
 *     test.todo below so the gap is explicit, never silent.
 */
function runTurnBusContract(
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

runTurnBusContract("MemoryTurnBus", (now) => new MemoryTurnBus(now));

// RedisTurnBus: behavioral contract needs a live Redis (CP_REDIS_URL). It maps
// each method 1:1 onto Redis primitives (SET EX, SET NX EX, INCR + EXPIRE,
// SUBSCRIBE/PUBLISH); the SEMANTICS those primitives must yield are pinned above
// on MemoryTurnBus, but only a Redis integration run can prove the wire mapping
// + cross-replica fan-out. This marker keeps that gap explicit.
test.todo("TurnBus contract: RedisTurnBus (needs a live Redis — integration pass)", () => {});
