import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentRosterSettled,
  isAgentGoneError,
  isAgentUnreadableError,
  isStaleRosterReadError,
  makeAgentGoneHealTrigger,
  makeRosterHealer,
  partitionStaleRosterReads,
} from "../src/lib/agent-gone.ts";

describe("isAgentGoneError", () => {
  it("matches the engine-client 404 for a vanished agent", () => {
    // Structural shape of HoustonEngineError(404, {error: "agent not found"})
    // from both adapter classes (packages/web and ui/engine-client).
    const err = Object.assign(new Error("agent not found (engine error 404)"), {
      status: 404,
      body: { error: "agent not found" },
    });
    assert.equal(isAgentGoneError(err), true);
  });

  it("matches a bare status-carrying object", () => {
    assert.equal(isAgentGoneError({ status: 404 }), true);
  });

  it("never matches other statuses — 5xx must stay loud", () => {
    assert.equal(isAgentGoneError({ status: 403 }), false);
    assert.equal(isAgentGoneError({ status: 500 }), false);
    assert.equal(isAgentGoneError({ status: 502 }), false);
    assert.equal(isAgentGoneError({ status: 503 }), false);
  });

  it("never matches non-errors or shapeless throws", () => {
    assert.equal(isAgentGoneError(undefined), false);
    assert.equal(isAgentGoneError(null), false);
    assert.equal(isAgentGoneError("agent not found"), false);
    assert.equal(isAgentGoneError(new Error("boom")), false);
    assert.equal(isAgentGoneError({ status: "404" }), false);
  });
});

describe("isAgentUnreadableError", () => {
  it("matches the gateway proxy's not-assigned 403", () => {
    // Structural shape of HoustonEngineError(403, {error, code}) — the
    // gateway's `code` sits at the top level of the body, not under `error`.
    const err = Object.assign(new Error("not allowed (engine error 403)"), {
      status: 403,
      body: { error: "not allowed", code: "not_assigned" },
    });
    assert.equal(isAgentUnreadableError(err), true);
    assert.equal(isStaleRosterReadError(err), true);
  });

  it("never matches the agent-gone 404 or any loud status", () => {
    assert.equal(isAgentUnreadableError({ status: 404 }), false);
    assert.equal(isAgentUnreadableError({ status: 401 }), false);
    assert.equal(isAgentUnreadableError({ status: 500 }), false);
    assert.equal(isAgentUnreadableError({ status: 503 }), false);
    assert.equal(isAgentUnreadableError(new Error("boom")), false);
    assert.equal(isAgentUnreadableError(undefined), false);
  });

  it("isStaleRosterReadError is exactly gone-or-unreadable", () => {
    assert.equal(isStaleRosterReadError({ status: 404 }), true);
    assert.equal(isStaleRosterReadError({ status: 403 }), true);
    assert.equal(isStaleRosterReadError({ status: 401 }), false);
    assert.equal(isStaleRosterReadError({ status: 502 }), false);
    assert.equal(isStaleRosterReadError(null), false);
  });
});

describe("agentRosterSettled", () => {
  it("is true only once loaded AND not mid-reload", () => {
    assert.equal(agentRosterSettled({ loaded: true, loading: false }), true);
  });

  it("stays closed before the first load (boot gap)", () => {
    assert.equal(agentRosterSettled({ loaded: false, loading: false }), false);
    assert.equal(agentRosterSettled({ loaded: false, loading: true }), false);
  });

  it("closes during a space switch's re-load — the HOU-979 window", () => {
    // `loaded` stays true across a switch while loadAgents re-runs; that is
    // exactly when queries built from the previous space's roster would fire.
    assert.equal(agentRosterSettled({ loaded: true, loading: true }), false);
  });
});

describe("makeRosterHealer", () => {
  it("reloads the roster when an agent-gone read is observed", async () => {
    const loads: string[] = [];
    const heal = makeRosterHealer(async (ws) => {
      loads.push(ws);
    });
    assert.equal(await heal("ws-1", true), true);
    assert.deepEqual(loads, ["ws-1"]);
  });

  it("does nothing without an agent-gone signal or a workspace", async () => {
    let loads = 0;
    const heal = makeRosterHealer(async () => {
      loads += 1;
    });
    assert.equal(await heal("ws-1", false), false);
    assert.equal(await heal(null, true), false);
    assert.equal(loads, 0);
  });

  it("collapses concurrent calls into the one in-flight reload", async () => {
    let loads = 0;
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const heal = makeRosterHealer(async () => {
      loads += 1;
      await gate;
    });
    const first = heal("ws-1", true);
    // A Skills page with several stale agents observes one agent-gone error
    // per manifest query in the same beat — only the first may reload.
    const second = heal("ws-1", true);
    assert.equal(await second, false);
    release();
    assert.equal(await first, true);
    assert.equal(loads, 1);
  });

  it("allows a later heal once the previous reload settled", async () => {
    let loads = 0;
    const heal = makeRosterHealer(async () => {
      loads += 1;
    });
    assert.equal(await heal("ws-1", true), true);
    assert.equal(await heal("ws-1", true), true);
    assert.equal(loads, 2);
  });

  it("clears the in-flight latch when the reload itself throws", async () => {
    let attempts = 0;
    const heal = makeRosterHealer(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("network down");
    });
    await assert.rejects(() => heal("ws-1", true));
    // The failed reload must not wedge the healer shut forever.
    assert.equal(await heal("ws-1", true), true);
    assert.equal(attempts, 2);
  });
});

describe("makeAgentGoneHealTrigger", () => {
  const agentGone = Object.assign(
    new Error("agent not found (engine error 404)"),
    { status: 404, body: { error: "agent not found" } },
  );

  it("fires the heal for the current workspace on an agent-gone read", () => {
    const calls: Array<[string | null, boolean]> = [];
    const trigger = makeAgentGoneHealTrigger(
      async (ws, gone) => {
        calls.push([ws, gone]);
        return true;
      },
      () => "ws-1",
    );
    trigger(agentGone);
    assert.deepEqual(calls, [["ws-1", true]]);
  });

  it("fires the heal on a not-readable 403 too — the roster is stale", () => {
    const calls: Array<[string | null, boolean]> = [];
    const trigger = makeAgentGoneHealTrigger(
      async (ws, stale) => {
        calls.push([ws, stale]);
        return true;
      },
      () => "ws-1",
    );
    trigger(
      Object.assign(new Error("not allowed (engine error 403)"), {
        status: 403,
      }),
    );
    assert.deepEqual(calls, [["ws-1", true]]);
  });

  it("ignores every other failure — surfacing stays with the caller", () => {
    let calls = 0;
    const trigger = makeAgentGoneHealTrigger(
      async () => {
        calls += 1;
        return true;
      },
      () => "ws-1",
    );
    trigger(Object.assign(new Error("engine unavailable"), { status: 503 }));
    trigger(new Error("boom"));
    trigger(undefined);
    assert.equal(calls, 0);
  });

  it("passes a missing workspace through as null (healer no-ops)", () => {
    const calls: Array<string | null> = [];
    const trigger = makeAgentGoneHealTrigger(
      async (ws) => {
        calls.push(ws);
        return false;
      },
      () => null,
    );
    trigger(agentGone);
    assert.deepEqual(calls, [null]);
  });
});

describe("partitionStaleRosterReads", () => {
  const gone = (agentPath: string) => ({
    agentPath,
    reason: Object.assign(new Error("agent not found (engine error 404)"), {
      status: 404,
    }),
  });
  const unreadable = (agentPath: string) => ({
    agentPath,
    reason: Object.assign(new Error("not allowed (engine error 403)"), {
      status: 403,
      body: { error: "not allowed", code: "not_assigned" },
    }),
  });
  const waking = (agentPath: string) => ({
    agentPath,
    reason: Object.assign(new Error("engine unavailable (engine error 503)"), {
      status: 503,
    }),
  });

  it("splits a stale roster's 404s from the real failures", () => {
    const { stale: g, failed } = partitionStaleRosterReads([
      gone("a"),
      waking("b"),
      gone("c"),
    ]);
    assert.deepEqual(
      g.map((r) => r.agentPath),
      ["a", "c"],
    );
    assert.deepEqual(
      failed.map((r) => r.agentPath),
      ["b"],
    );
  });

  it("keeps an unassigned agent's 403 out of the partial-sweep surface", () => {
    // HOUSTON-APP-5AV / 5AT: one agent the viewer may not read, among 200
    // siblings that answered. The sweep's failed list holds only the 403 —
    // it is stale-roster, so `failed` is empty and the recovery layer sees a
    // COMPLETE sweep: no toast, no Sentry report, no re-sweep escalation.
    const { stale: g, failed } = partitionStaleRosterReads([unreadable("z")]);
    assert.deepEqual(
      g.map((r) => r.agentPath),
      ["z"],
    );
    assert.deepEqual(failed, []);
  });

  it("a mixed sweep still reports the real failure beside the 403", () => {
    const { stale: g, failed } = partitionStaleRosterReads([
      unreadable("a"),
      waking("b"),
      gone("c"),
    ]);
    assert.deepEqual(
      g.map((r) => r.agentPath),
      ["a", "c"],
    );
    assert.deepEqual(
      failed.map((r) => r.agentPath),
      ["b"],
    );
  });

  it("leaves a sweep with no gone agents untouched", () => {
    const reads = [waking("a"), waking("b")];
    const { stale: g, failed } = partitionStaleRosterReads(reads);
    assert.deepEqual(g, []);
    assert.deepEqual(failed, reads);
  });

  it("classifies an all-gone sweep as nothing to re-sweep", () => {
    // The space-switch shape (HOUSTON-APP-4WR): every agent of the previous
    // space's roster answers 404 under the new org.
    const { stale: g, failed } = partitionStaleRosterReads([
      gone("a"),
      gone("b"),
    ]);
    assert.equal(g.length, 2);
    assert.deepEqual(failed, []);
  });

  it("is empty-safe", () => {
    assert.deepEqual(partitionStaleRosterReads([]), { stale: [], failed: [] });
  });
});
