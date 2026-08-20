import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ClaudeHandoffResult,
  settleRemoteClaudeLogin,
} from "../src/lib/claude-login-settle.ts";

/**
 * The remote Claude login's settlement policy (HOU-1143 + the 2026-08-15
 * broken-image incident): a connect that actually worked is never failed, and
 * a handoff that genuinely failed settles as `handoff-failed` — a standard
 * error surface — NEVER the token paste dialog. The paste flow is not a
 * settlement outcome at all: it exists only for the pre-AVX2 hardware
 * fallback routed in claude-login-failure.ts.
 */

/** A confirm probe with a scripted answer that records whether it ran. */
function probe(answer: boolean) {
  let calls = 0;
  const confirm = async () => {
    calls++;
    return answer;
  };
  return { confirm, ran: () => calls > 0 };
}

const pushFailed: ClaudeHandoffResult = {
  ok: false,
  reason: "push-failed",
  error: { status: 502 },
};

describe("settleRemoteClaudeLogin", () => {
  it("push ok + engine confirms → connected, no recovery flag", async () => {
    const { confirm } = probe(true);
    assert.deepEqual(await settleRemoteClaudeLogin({ ok: true }, confirm), {
      kind: "connected",
      recovered: false,
    });
  });

  it("push ok + confirm window elapses → confirm-timeout, never paste", async () => {
    // The credential IS stored; a slow pod must not cost a manual token paste.
    const { confirm } = probe(false);
    assert.deepEqual(await settleRemoteClaudeLogin({ ok: true }, confirm), {
      kind: "confirm-timeout",
    });
  });

  it("push transport failed but anthropic reads connected → recovered success (HOU-1143)", async () => {
    // The gateway held the push past the webview's fetch timeout (setup-pod
    // cold start), or stored the credential and only the pod-materialize leg
    // failed. The user's connect WORKED — no paste dialog.
    const { confirm } = probe(true);
    assert.deepEqual(await settleRemoteClaudeLogin(pushFailed, confirm), {
      kind: "connected",
      recovered: true,
    });
  });

  it("push failed and anthropic reads disconnected → handoff-failed (an infrastructure error), never paste", async () => {
    // The 2026-08-15 shape: a broken engine image (spawn claude ENOENT) makes
    // every probe read disconnected. The user's browser login succeeded, so
    // this is Houston's failure — an error surface, not a CLI/paste task.
    const { confirm } = probe(false);
    assert.deepEqual(await settleRemoteClaudeLogin(pushFailed, confirm), {
      kind: "handoff-failed",
      reason: { status: 502 },
    });
  });

  it("extraction failed → handoff-failed immediately, without probing", async () => {
    // Nothing left the machine, so a connected probe could only be reading a
    // pre-existing credential — probing would mask a failed fresh mint.
    const { confirm, ran } = probe(true);
    const result: ClaudeHandoffResult = {
      ok: false,
      reason: "no-credential",
      error: new Error("handoff dir empty"),
    };
    assert.deepEqual(await settleRemoteClaudeLogin(result, confirm), {
      kind: "handoff-failed",
      reason: result.error,
    });
    assert.equal(ran(), false);
  });
});
