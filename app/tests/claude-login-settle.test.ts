import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ClaudeHandoffResult,
  settleRemoteClaudeLogin,
} from "../src/lib/claude-login-settle.ts";

/**
 * The remote Claude login's settlement policy (HOU-1143): the paste dialog is
 * the LAST resort, shown only when anthropic genuinely reads disconnected —
 * never over a connect that actually worked.
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

  it("push failed and anthropic reads disconnected → paste, carrying the push error", async () => {
    const { confirm } = probe(false);
    assert.deepEqual(await settleRemoteClaudeLogin(pushFailed, confirm), {
      kind: "paste",
      reason: { status: 502 },
    });
  });

  it("extraction failed → paste immediately, without probing", async () => {
    // Nothing left the machine, so a connected probe could only be reading a
    // pre-existing credential — probing would mask a failed fresh mint.
    const { confirm, ran } = probe(true);
    const result: ClaudeHandoffResult = {
      ok: false,
      reason: "no-credential",
      error: new Error("handoff dir empty"),
    };
    assert.deepEqual(await settleRemoteClaudeLogin(result, confirm), {
      kind: "paste",
      reason: result.error,
    });
    assert.equal(ran(), false);
  });
});
