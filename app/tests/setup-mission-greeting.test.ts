import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  parsePersistedGreetings,
  SETUP_GREETING_REVEAL_MS,
  SETUP_GREETING_TTL_MS,
  SetupGreetingRegistry,
} from "../src/lib/setup-mission-greeting.ts";

/** Manual clock + in-memory mirror. */
function harness(initialRaw: string | null = null) {
  let now = 1_000_000;
  let raw = initialRaw;
  const registry = new SetupGreetingRegistry({
    now: () => now,
    read: () => raw,
    write: (next) => {
      raw = next;
    },
  });
  return {
    registry,
    tick: (ms: number) => {
      now += ms;
    },
    raw: () => raw,
    nowValue: () => now,
  };
}

describe("SetupGreetingRegistry", () => {
  it("registers a mission and reveals after the beat", () => {
    const h = harness();
    h.registry.register({
      agentPath: "/w/a",
      sessionKey: "activity-x",
      agentName: "Nova",
    });
    const entry = h.registry.get("/w/a", "activity-x");
    strictEqual(entry?.agentName, "Nova");
    strictEqual(
      h.registry.revealDelayRemaining(entry),
      SETUP_GREETING_REVEAL_MS,
    );
    h.tick(SETUP_GREETING_REVEAL_MS);
    strictEqual(h.registry.revealDelayRemaining(entry), 0);
  });

  it("unknown conversations answer null", () => {
    const h = harness();
    strictEqual(h.registry.get("/w/a", "activity-x"), null);
  });

  it("survives a relaunch through the persisted mirror", () => {
    const h = harness();
    h.registry.register({
      agentPath: "/w/a",
      sessionKey: "activity-x",
      agentName: "Nova",
    });
    const reborn = new SetupGreetingRegistry({
      now: h.nowValue,
      read: h.raw,
      write: () => {},
    });
    strictEqual(reborn.get("/w/a", "activity-x")?.agentName, "Nova");
  });

  it("expires stale entries on read", () => {
    const h = harness();
    h.registry.register({
      agentPath: "/w/a",
      sessionKey: "activity-x",
      agentName: "Nova",
    });
    h.tick(SETUP_GREETING_TTL_MS);
    strictEqual(h.registry.get("/w/a", "activity-x"), null);
    // The expiry also cleared the mirror.
    strictEqual(h.raw(), null);
  });

  it("notifies subscribers on register", () => {
    const h = harness();
    let calls = 0;
    const off = h.registry.subscribe(() => {
      calls += 1;
    });
    h.registry.register({
      agentPath: "/w/a",
      sessionKey: "activity-x",
      agentName: "Nova",
    });
    off();
    h.registry.register({
      agentPath: "/w/b",
      sessionKey: "activity-y",
      agentName: "Vega",
    });
    strictEqual(calls, 1);
  });
});

describe("parsePersistedGreetings", () => {
  it("drops malformed payloads without throwing", () => {
    strictEqual(parsePersistedGreetings("not json", 0).length, 0);
    strictEqual(parsePersistedGreetings('{"a":1}', 0).length, 0);
    strictEqual(parsePersistedGreetings(null, 0).length, 0);
  });

  it("keeps fresh entries and drops stale ones", () => {
    const fresh = {
      agentPath: "/w/a",
      sessionKey: "activity-x",
      agentName: "Nova",
      registeredAt: 100,
    };
    const stale = { ...fresh, sessionKey: "activity-old", registeredAt: 0 };
    const kept = parsePersistedGreetings(
      JSON.stringify([fresh, stale, { junk: true }]),
      SETUP_GREETING_TTL_MS,
    );
    strictEqual(kept.length, 1);
    strictEqual(kept[0]?.sessionKey, "activity-x");
  });
});
