import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type CodexRelayRecoveryOps,
  RELAY_RESTART_COOLDOWN_MS,
  recoverFailedCodexRelay,
} from "../src/lib/codex-relay-recovery.ts";

// HOU-1113 / HOUSTON-APP-56B — the engine can drop a Codex sign-in before the
// browser callback arrives (pod recycled mid-consent, abandoned-login timer,
// app restarted mid-flow); the relayed code then answers `no active login for
// openai-codex`. That is user timing, not a bug: the relay restarts the same
// browser sign-in once per cooldown window behind an expected-state toast
// (a breadcrumb, never a Sentry error), and dead-ends past the budget by
// asking the user to start over. Every OTHER failure keeps the loud path.
// These pin that policy.

/** The runtime client's `EngineError` shape, as the classifier sees it. */
function lostLogin(): Error {
  const err = new Error(
    'engine request failed (400): {"error":"no active login for openai-codex"}',
  );
  err.name = "EngineError";
  Object.assign(err, {
    status: 400,
    body: '{"error":"no active login for openai-codex"}',
  });
  return err;
}

function recordingOps(overrides: Partial<CodexRelayRecoveryOps> = {}): {
  ops: CodexRelayRecoveryOps;
  calls: string[];
  failures: unknown[];
} {
  const calls: string[] = [];
  const failures: unknown[] = [];
  const ops: CodexRelayRecoveryOps = {
    report: () => calls.push("report"),
    breadcrumb: () => calls.push("breadcrumb"),
    restartLogin: async () => {
      calls.push("restart");
    },
    fail: (cause) => {
      calls.push("fail");
      failures.push(cause);
    },
    expired: (restarting) =>
      calls.push(restarting ? "expired:restarting" : "expired:retry"),
    lastRestartAt: () => null,
    noteRestart: () => calls.push("note"),
    now: () => 1_000_000,
    ...overrides,
  };
  return { ops, calls, failures };
}

describe("recoverFailedCodexRelay", () => {
  it("restarts the sign-in on a lost login behind the expired toast, with no report and no failure toast", async () => {
    const { ops, calls } = recordingOps();
    await recoverFailedCodexRelay(lostLogin(), ops);
    deepStrictEqual(calls, [
      "breadcrumb",
      "note",
      "expired:restarting",
      "restart",
    ]);
  });

  it("notes the restart BEFORE launching, so a racing relay cannot double-restart", async () => {
    const { ops, calls } = recordingOps({
      restartLogin: async () => {
        throw new Error("launch failed");
      },
    });
    await recoverFailedCodexRelay(lostLogin(), ops);
    deepStrictEqual(calls, [
      "breadcrumb",
      "note",
      "expired:restarting",
      "fail",
    ]);
  });

  it("asks the user to start over on a second lost login inside the cooldown window", async () => {
    const { ops, calls, failures } = recordingOps({
      lastRestartAt: () => 1_000_000 - RELAY_RESTART_COOLDOWN_MS + 1,
    });
    await recoverFailedCodexRelay(lostLogin(), ops);
    deepStrictEqual(calls, ["breadcrumb", "expired:retry"]);
    deepStrictEqual(failures, []);
  });

  it("restarts again once the cooldown has elapsed", async () => {
    const { ops, calls } = recordingOps({
      lastRestartAt: () => 1_000_000 - RELAY_RESTART_COOLDOWN_MS,
    });
    await recoverFailedCodexRelay(lostLogin(), ops);
    deepStrictEqual(calls, [
      "breadcrumb",
      "note",
      "expired:restarting",
      "restart",
    ]);
  });

  it("reports and dead-ends any non-lost-login failure without restarting", async () => {
    const err = new Error("Load failed");
    const { ops, calls, failures } = recordingOps();
    await recoverFailedCodexRelay(err, ops);
    deepStrictEqual(calls, ["report", "fail"]);
    deepStrictEqual(failures, [err]);
  });

  it("keeps a bare-message lookalike on the loud path", async () => {
    // Only the runtime client's typed 400 is the expected state; a message
    // match alone would silence a real error that merely quotes it.
    const err = new Error(
      'engine request failed (400): {"error":"no active login for openai-codex"}',
    );
    const { ops, calls } = recordingOps();
    await recoverFailedCodexRelay(err, ops);
    deepStrictEqual(calls, ["report", "fail"]);
  });

  it("surfaces a restart launch failure as the dead-end", async () => {
    const launchErr = new Error("browser refused");
    const { ops, failures } = recordingOps({
      restartLogin: async () => {
        throw launchErr;
      },
    });
    await recoverFailedCodexRelay(lostLogin(), ops);
    deepStrictEqual(failures, [launchErr]);
  });
});
