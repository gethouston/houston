import { afterAll, describe, expect, mock, test } from "bun:test";
import type { TurnBus } from "./bus";
import { MemoryTurnBus } from "./bus";

// Replace `ioredis` with the in-process `ioredis-mock` BEFORE bus-redis.ts is
// imported, so the REAL RedisTurnBus runs against a faithful in-memory Redis
// (cross-instance pub/sub + native EX/NX/INCR/EXPIRE) with no docker. The mock
// is a documented drop-in for ioredis's `Redis` class; every instance shares one
// in-memory server, which is exactly the cross-replica fan-out we want to prove.
mock.module("ioredis", () => ({ Redis: require("ioredis-mock") }));
const { RedisTurnBus } = await import("./bus-redis");

// ioredis-mock keeps ONE shared in-memory server whose pub/sub emitter gathers a
// listener per connection; this suite stands up several bus instances (each =
// two connections) so it crosses Node's default 10-listener warn threshold.
// That ceiling is meaningful for a real long-lived process, not for a short test
// that deliberately fans out connections — raise it so the suite stays quiet.
const { EventEmitter } = require("node:events");
EventEmitter.defaultMaxListeners = 100;

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
 * RedisTurnBus (turn/bus-redis.ts) IS now run through this contract, against the
 * in-process `ioredis-mock` (a documented drop-in for ioredis's `Redis` class,
 * mock.module'd in at the top of this file — no docker, no CP_REDIS_URL). Because
 * RedisTurnBus has no injectable clock, its run is split into a time-independent
 * block (pub/sub fan-out + unsubscribe + channel isolation + key round-trip +
 * a cross-instance "cross-replica" delivery proof) and a time-dependent block
 * that drives Redis's NATIVE EX/NX/EXPIRE with real short TTLs (the same
 * semantics the virtual clock pins on MemoryTurnBus). See the RedisTurnBus suite
 * below for the wire-mapping it proves and the ioredis-mock caveats it carries.
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

runTurnBusContract("MemoryTurnBus", (now) => new MemoryTurnBus(now));

// RedisTurnBus, against the in-process `ioredis-mock` wired at the top of this
// file. Two split-out suites because RedisTurnBus has NO injectable clock (it
// rides Redis's own EX/NX/TTL), so the virtual-clock contract above can't drive
// it; instead:
//   1) the TIME-INDEPENDENT contract behaviors run verbatim against the real bus,
//      proving the pub/sub fan-out + unsubscribe + channel isolation + key
//      round-trip wire mapping AND cross-instance (≈ cross-replica) delivery;
//   2) the TIME-DEPENDENT semantics (TTL expiry, setNx mutex + lease renew, incr
//      creation-TTL) run with REAL (short) timeouts against Redis's native
//      clock — the same assertions the virtual clock pins on MemoryTurnBus.
// ioredis-mock shares ONE in-memory server across every `new Redis(url)`, which
// is precisely the cross-replica model (cmd publishes, sub on another connection
// receives). Keys/channels are namespaced per test so the shared server can't
// bleed state between cases.
describe("TurnBus contract: RedisTurnBus (ioredis-mock)", () => {
  const buses: TurnBus[] = [];
  const make = (): TurnBus => {
    const b = new RedisTurnBus("redis://localhost:6379");
    buses.push(b);
    return b;
  };
  afterAll(() => {
    // Drop the mock Redis connections so the test process can exit cleanly.
    for (const b of buses) {
      const conns = b as unknown as {
        cmd?: { disconnect?: () => void };
        sub?: { disconnect?: () => void };
      };
      conns.cmd?.disconnect?.();
      conns.sub?.disconnect?.();
    }
  });

  // --- time-INDEPENDENT contract behaviors (verbatim) ---
  test("publish fans out to every subscriber; unsubscribe stops delivery", async () => {
    const bus = make();
    const a: string[] = [];
    const b: string[] = [];
    const unsubA = bus.subscribe("r1", (m) => a.push(m));
    bus.subscribe("r1", (m) => b.push(m));
    // ioredis-mock SUBSCRIBE settles async; let the subscription register.
    await delay(20);
    await bus.publish("r1", "one");
    await delay(20);
    unsubA();
    await delay(20);
    await bus.publish("r1", "two");
    await delay(20);
    expect(a).toEqual(["one"]);
    expect(b).toEqual(["one", "two"]);
  });

  test("a publish on a SEPARATE bus instance reaches this bus's subscriber (cross-replica fan-out)", async () => {
    const subBus = make();
    const pubBus = make(); // a different replica's connection pair
    const got: string[] = [];
    subBus.subscribe("r-xrep", (m) => got.push(m));
    await delay(20);
    await pubBus.publish("r-xrep", "from-other-replica");
    await delay(20);
    expect(got).toEqual(["from-other-replica"]);
  });

  test("channels are isolated — a publish reaches only that channel's subscribers", async () => {
    const bus = make();
    const got: string[] = [];
    bus.subscribe("r-a", (m) => got.push(`a:${m}`));
    bus.subscribe("r-b", (m) => got.push(`b:${m}`));
    await delay(20);
    await bus.publish("r-a", "1");
    await bus.publish("r-b", "2");
    await delay(20);
    expect(got.sort()).toEqual(["a:1", "b:2"]);
  });

  test("get/set/del round-trip; get on a never-set key is null", async () => {
    const bus = make();
    expect(await bus.get("r-nope")).toBeNull();
    await bus.set("r-k", "v", 30);
    expect(await bus.get("r-k")).toBe("v");
    await bus.del("r-k");
    expect(await bus.get("r-k")).toBeNull();
  });

  // --- time-DEPENDENT semantics on Redis's native clock (real short TTLs) ---
  test("set with TTL expires on the native clock", async () => {
    const bus = make();
    await bus.set("r-ttl", "v", 1); // 1s — the smallest EX granularity
    expect(await bus.get("r-ttl")).toBe("v");
    await delay(1_200);
    expect(await bus.get("r-ttl")).toBeNull();
  });

  test("setNx is a mutex; expire renews the lease; the TTL frees a crashed owner", async () => {
    const bus = make();
    expect(await bus.setNx("r-lock", "1", 1)).toBe(true); // acquired (1s lease)
    expect(await bus.setNx("r-lock", "1", 1)).toBe(false); // held
    await delay(600);
    await bus.expire("r-lock", 1); // heartbeat at 0.6s → renew to 1s
    await delay(600); // 1.2s total; would have lapsed at 1s without the renew
    expect(await bus.setNx("r-lock", "1", 1)).toBe(false); // still held
    await delay(1_100); // owner "crashed": no more heartbeats → lease lapses
    expect(await bus.setNx("r-lock", "1", 1)).toBe(true); // free
  });

  test("incr creates with TTL, counts atomically; decr reverses; the counter resets after TTL", async () => {
    const bus = make();
    expect(await bus.incr("r-n", 1)).toBe(1); // creates with a 1s TTL
    expect(await bus.incr("r-n", 1)).toBe(2); // EXPIRE only set on creation
    expect(await bus.decr("r-n")).toBe(1);
    await delay(1_200); // creation TTL lapses
    expect(await bus.incr("r-n", 1)).toBe(1); // counter reset
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
