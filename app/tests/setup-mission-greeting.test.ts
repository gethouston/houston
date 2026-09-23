import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  parsePersistedGreetings,
  SETUP_GREETING_TTL_MS,
  SetupGreetingRegistry,
  setupGreetingRole,
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

const NOVA = {
  agentPath: "/w/a",
  sessionKey: "activity-x",
  agentName: "Nova",
  role: "Financial analyst",
};

describe("SetupGreetingRegistry", () => {
  it("answers the recorded name and role for the conversation", () => {
    const h = harness();
    h.registry.register(NOVA);
    const entry = h.registry.get("/w/a", "activity-x");
    strictEqual(entry?.agentName, "Nova");
    strictEqual(entry?.role, "Financial analyst");
    strictEqual(entry?.registeredAt, h.nowValue());
  });

  it("records an agent created without a role", () => {
    const h = harness();
    h.registry.register({ ...NOVA, role: null });
    strictEqual(h.registry.get("/w/a", "activity-x")?.role, null);
  });

  it("answers the SAME object every read, so a snapshot is stable", () => {
    const h = harness();
    h.registry.register(NOVA);
    strictEqual(
      h.registry.get("/w/a", "activity-x"),
      h.registry.get("/w/a", "activity-x"),
    );
  });

  it("unknown conversations answer null", () => {
    const h = harness();
    h.registry.register(NOVA);
    strictEqual(h.registry.get("/w/a", "activity-other"), null);
    strictEqual(h.registry.get("/w/other", "activity-x"), null);
  });

  it("survives a relaunch through the persisted mirror", () => {
    const h = harness();
    h.registry.register(NOVA);
    const reborn = new SetupGreetingRegistry({
      now: h.nowValue,
      read: h.raw,
      write: () => {},
    });
    strictEqual(reborn.get("/w/a", "activity-x")?.role, "Financial analyst");
  });

  it("stops answering past the TTL, without writing during the read", () => {
    const h = harness();
    h.registry.register(NOVA);
    const persisted = h.raw();
    h.tick(SETUP_GREETING_TTL_MS);
    strictEqual(h.registry.get("/w/a", "activity-x"), null);
    strictEqual(h.raw(), persisted);
  });

  it("drops stale entries from the mirror on the next register", () => {
    const h = harness();
    h.registry.register(NOVA);
    h.tick(SETUP_GREETING_TTL_MS);
    h.registry.register({
      agentPath: "/w/b",
      sessionKey: "activity-y",
      agentName: "Vega",
      role: null,
    });
    deepStrictEqual(
      JSON.parse(h.raw() ?? "[]").map(
        (e: { agentName: string }) => e.agentName,
      ),
      ["Vega"],
    );
  });

  it("notifies subscribers on register", () => {
    const h = harness();
    let calls = 0;
    const off = h.registry.subscribe(() => {
      calls += 1;
    });
    h.registry.register(NOVA);
    off();
    h.registry.register({ ...NOVA, sessionKey: "activity-y" });
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
    const fresh = { ...NOVA, registeredAt: 100 };
    const stale = { ...fresh, sessionKey: "activity-old", registeredAt: 0 };
    const kept = parsePersistedGreetings(
      JSON.stringify([fresh, stale, { junk: true }]),
      SETUP_GREETING_TTL_MS,
    );
    strictEqual(kept.length, 1);
    strictEqual(kept[0]?.sessionKey, "activity-x");
  });

  it("accepts a role of null and rejects one of another type", () => {
    const kept = parsePersistedGreetings(
      JSON.stringify([
        { ...NOVA, role: null, registeredAt: 100 },
        { ...NOVA, sessionKey: "activity-y", role: 7, registeredAt: 100 },
      ]),
      100,
    );
    strictEqual(kept.length, 1);
    strictEqual(kept[0]?.role, null);
  });

  it("drops an entry with no role at all", () => {
    const { role: _role, ...roleless } = NOVA;
    strictEqual(
      parsePersistedGreetings(
        JSON.stringify([{ ...roleless, registeredAt: 100 }]),
        100,
      ).length,
      0,
    );
  });
});

const withRole = (role: string) =>
  `---\nindustry: Finance\nrole: ${role}\n---\n`;

describe("setupGreetingRole", () => {
  it("names the job the agent was hired for", () => {
    strictEqual(
      setupGreetingRole(withRole("Financial analyst")),
      "Financial analyst",
    );
  });

  it("keeps the role the user's own words carry, spaces and all", () => {
    strictEqual(
      setupGreetingRole(withRole("  Head of people ops  ")),
      "Head of people ops",
    );
  });

  it("answers null for a description with no role", () => {
    strictEqual(setupGreetingRole("---\nindustry: Finance\n---\n"), null);
    strictEqual(
      setupGreetingRole("---\nindustry: Finance\nrole:\n---\n"),
      null,
    );
    strictEqual(setupGreetingRole("Just prose, no block at all.\n"), null);
  });

  it("answers null while the job description is unread", () => {
    strictEqual(setupGreetingRole(undefined), null);
    strictEqual(setupGreetingRole(""), null);
  });

  it("reads the role from a description the agent has written under", () => {
    strictEqual(
      setupGreetingRole(
        `${withRole("Operations coordinator")}\nI handle the weekly close.\n`,
      ),
      "Operations coordinator",
    );
  });
});
