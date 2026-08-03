import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  type CodexRelayRecoveryOps,
  isLoginSessionLostError,
  RELAY_RESTART_COOLDOWN_MS,
  recoverFailedCodexRelay,
} from "../src/lib/codex-relay-recovery.ts";

// HOU-1113 — the engine pod serving a Codex sign-in can be recycled while the
// user sits on OpenAI's consent screen; the relayed callback code then hits a
// fresh process that answers `no active login for openai-codex`, and the old
// behavior dead-ended with a raw 400 toast. The relay now restarts the same
// browser sign-in once per cooldown window (OpenAI redirects an
// already-consented app straight through). These pin that policy.

const LOST = new Error(
  'engine request failed (400): {"error":"no active login for openai-codex"}',
);

function recordingOps(overrides: Partial<CodexRelayRecoveryOps> = {}): {
  ops: CodexRelayRecoveryOps;
  calls: string[];
  failures: unknown[];
} {
  const calls: string[] = [];
  const failures: unknown[] = [];
  const ops: CodexRelayRecoveryOps = {
    report: () => calls.push("report"),
    restartLogin: async () => {
      calls.push("restart");
    },
    fail: (cause) => {
      calls.push("fail");
      failures.push(cause);
    },
    lastRestartAt: () => null,
    noteRestart: () => calls.push("note"),
    now: () => 1_000_000,
    ...overrides,
  };
  return { ops, calls, failures };
}

describe("isLoginSessionLostError", () => {
  it("matches the runtime's no-active-login 400", () => {
    strictEqual(isLoginSessionLostError(LOST), true);
  });

  it("rejects unrelated failures", () => {
    strictEqual(isLoginSessionLostError(new Error("Load failed")), false);
    strictEqual(isLoginSessionLostError("engine request failed (500)"), false);
  });
});

describe("recoverFailedCodexRelay", () => {
  it("restarts the sign-in on a lost login, with no failure toast", async () => {
    const { ops, calls } = recordingOps();
    await recoverFailedCodexRelay(LOST, ops);
    deepStrictEqual(calls, ["report", "note", "restart"]);
  });

  it("notes the restart BEFORE launching, so a racing relay cannot double-restart", async () => {
    const { ops, calls } = recordingOps({
      restartLogin: async () => {
        throw new Error("launch failed");
      },
    });
    await recoverFailedCodexRelay(LOST, ops);
    deepStrictEqual(calls, ["report", "note", "fail"]);
  });

  it("dead-ends a second lost login inside the cooldown window", async () => {
    const { ops, calls, failures } = recordingOps({
      lastRestartAt: () => 1_000_000 - RELAY_RESTART_COOLDOWN_MS + 1,
    });
    await recoverFailedCodexRelay(LOST, ops);
    deepStrictEqual(calls, ["report", "fail"]);
    deepStrictEqual(failures, [LOST]);
  });

  it("restarts again once the cooldown has elapsed", async () => {
    const { ops, calls } = recordingOps({
      lastRestartAt: () => 1_000_000 - RELAY_RESTART_COOLDOWN_MS,
    });
    await recoverFailedCodexRelay(LOST, ops);
    deepStrictEqual(calls, ["report", "note", "restart"]);
  });

  it("dead-ends any non-lost-login failure without restarting", async () => {
    const err = new Error("Load failed");
    const { ops, calls, failures } = recordingOps();
    await recoverFailedCodexRelay(err, ops);
    deepStrictEqual(calls, ["report", "fail"]);
    deepStrictEqual(failures, [err]);
  });

  it("surfaces a restart launch failure as the dead-end", async () => {
    const launchErr = new Error("browser refused");
    const { ops, failures } = recordingOps({
      restartLogin: async () => {
        throw launchErr;
      },
    });
    await recoverFailedCodexRelay(LOST, ops);
    deepStrictEqual(failures, [launchErr]);
  });
});
