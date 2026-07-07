import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  PROVISIONING_RETRY_MS,
  PROVISIONING_TTL_MS,
  parsePersistedProvisioning,
  probeSaysStillStarting,
  runProvisioningProbe,
} from "../src/lib/agent-provisioning.ts";

const httpError = (status: number) => Object.assign(new Error("x"), { status });

describe("probeSaysStillStarting", () => {
  it("keeps waiting on gateway warm-up statuses", () => {
    strictEqual(probeSaysStillStarting(httpError(502)), true);
    strictEqual(probeSaysStillStarting(httpError(503)), true);
    strictEqual(probeSaysStillStarting(httpError(504)), true);
  });

  it("keeps waiting on transport-level failures with no HTTP verdict", () => {
    strictEqual(probeSaysStillStarting(new TypeError("fetch failed")), true);
    strictEqual(probeSaysStillStarting(undefined), true);
    strictEqual(probeSaysStillStarting("connection reset"), true);
  });

  it("treats any definitive HTTP answer as the engine having responded", () => {
    // 404: probe file (or the agent itself) is gone — either way something
    // answered for this agent, so "being created" is over.
    strictEqual(probeSaysStillStarting(httpError(404)), false);
    strictEqual(probeSaysStillStarting(httpError(401)), false);
    strictEqual(probeSaysStillStarting(httpError(500)), false);
  });
});

describe("parsePersistedProvisioning", () => {
  const now = 1_000_000_000;
  const fresh = { agentId: "a1", agentPath: "/w/a1", since: now - 60_000 };

  it("keeps fresh entries and drops expired ones", () => {
    const expired = {
      agentId: "a2",
      agentPath: "/w/a2",
      since: now - PROVISIONING_TTL_MS,
    };
    deepStrictEqual(
      parsePersistedProvisioning(JSON.stringify([fresh, expired]), now),
      [fresh],
    );
  });

  it("survives malformed storage", () => {
    deepStrictEqual(parsePersistedProvisioning(null, now), []);
    deepStrictEqual(parsePersistedProvisioning("not json", now), []);
    deepStrictEqual(parsePersistedProvisioning('{"a":1}', now), []);
    deepStrictEqual(
      parsePersistedProvisioning(JSON.stringify([{ agentId: 3 }, fresh]), now),
      [fresh],
    );
  });

  it("keeps well-formed pending sends and drops malformed ones", () => {
    const send = { id: "s1", sessionKey: "activity-a", text: "hi" };
    const parsed = parsePersistedProvisioning(
      JSON.stringify([
        { ...fresh, pendingSends: [send, { text: 5 }, null, { id: "x" }] },
      ]),
      now,
    );
    deepStrictEqual(parsed[0].pendingSends, [send]);
  });

  it("round-trips the optimistic-row fields on a pending send (HOU-713)", () => {
    const send = {
      id: "s1",
      sessionKey: "activity-a",
      text: "hi",
      queuedAt: now - 1_000,
      titleText: "hi",
      row: { id: "a", title: "Hi", description: "hi" },
    };
    const parsed = parsePersistedProvisioning(
      JSON.stringify([{ ...fresh, pendingSends: [send] }]),
      now,
    );
    deepStrictEqual(parsed[0].pendingSends, [send]);
  });
});

describe("runProvisioningProbe", () => {
  const entry = { agentId: "a1", agentPath: "/w/a1", since: 0 };
  /** Sentinel read result: the request stays held open forever. */
  const HELD = Symbol("held");

  function harness(readResults: Array<unknown | Error>) {
    const calls = { ready: 0, timeout: 0, sleeps: 0, reads: 0 };
    let timeoutError: unknown;
    let marked = true;
    let clock = 1;
    // The whole-probe TTL deadline is the one sleep longer than a retry
    // pause; hold it pending unless a test fires it explicitly.
    let fireDeadline: () => void = () => {
      throw new Error("deadline not armed");
    };
    const deps = {
      readFile: (): Promise<unknown> => {
        calls.reads++;
        const next = readResults.shift();
        if (next === HELD) return new Promise(() => {});
        if (next instanceof Error) return Promise.reject(next);
        return Promise.resolve(next);
      },
      isMarked: () => marked,
      onReady: () => {
        calls.ready++;
        marked = false;
      },
      onTimeout: (_id: string, lastError: unknown) => {
        calls.timeout++;
        timeoutError = lastError;
        marked = false;
      },
      sleep: (ms: number): Promise<void> => {
        if (ms > PROVISIONING_RETRY_MS) {
          return new Promise<void>((r) => {
            fireDeadline = r;
          });
        }
        calls.sleeps++;
        return Promise.resolve();
      },
      now: () => clock,
      setClock: (t: number) => {
        clock = t;
      },
      unmark: () => {
        marked = false;
      },
      fireDeadline: () => fireDeadline(),
    };
    return { deps, calls, timeoutError: () => timeoutError };
  }

  it("clears the moment the engine answers", async () => {
    const { deps, calls } = harness(["ok"]);
    await runProvisioningProbe(entry, deps);
    deepStrictEqual(calls, { ready: 1, timeout: 0, sleeps: 0, reads: 1 });
  });

  it("retries through warm-up failures, then clears", async () => {
    const { deps, calls } = harness([
      httpError(503),
      new TypeError("fetch failed"),
      "ok",
    ]);
    await runProvisioningProbe(entry, deps);
    deepStrictEqual(calls, { ready: 1, timeout: 0, sleeps: 2, reads: 3 });
  });

  it("treats a definitive HTTP failure as ready (engine responded)", async () => {
    const { deps, calls } = harness([httpError(404)]);
    await runProvisioningProbe(entry, deps);
    deepStrictEqual(calls, { ready: 1, timeout: 0, sleeps: 0, reads: 1 });
  });

  it("times out with the last failure once the TTL elapses", async () => {
    const { deps, calls, timeoutError } = harness([httpError(503)]);
    const retrySleep = deps.sleep;
    deps.sleep = (ms: number) => {
      const p = retrySleep(ms);
      if (ms <= PROVISIONING_RETRY_MS) deps.setClock(PROVISIONING_TTL_MS + 1);
      return p;
    };
    await runProvisioningProbe(entry, deps);
    deepStrictEqual(calls, { ready: 0, timeout: 1, sleeps: 1, reads: 1 });
    strictEqual((timeoutError() as { status?: number }).status, 503);
  });

  it("times out even while an attempt is held open server-side", async () => {
    const { deps, calls } = harness([HELD]);
    const probe = runProvisioningProbe(entry, deps);
    // Let the probe issue the read (which never settles), then hit the TTL.
    await Promise.resolve();
    deps.fireDeadline();
    await probe;
    deepStrictEqual(calls, { ready: 0, timeout: 1, sleeps: 0, reads: 1 });
  });

  it("stops silently when the entry is retired mid-loop", async () => {
    const { deps, calls } = harness([httpError(503)]);
    const retrySleep = deps.sleep;
    deps.sleep = (ms: number) => {
      const p = retrySleep(ms);
      if (ms <= PROVISIONING_RETRY_MS) deps.unmark();
      return p;
    };
    await runProvisioningProbe(entry, deps);
    deepStrictEqual(calls, { ready: 0, timeout: 0, sleeps: 1, reads: 1 });
  });
});
