import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ClaudeHandoffResult,
  settleRemoteClaudeLogin,
} from "../src/lib/claude-login-settle.ts";

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
    const { confirm } = probe(false);
    assert.deepEqual(await settleRemoteClaudeLogin({ ok: true }, confirm), {
      kind: "confirm-timeout",
    });
  });

  it("push transport failed but anthropic reads connected → recovered success (HOU-1143)", async () => {
    const { confirm } = probe(true);
    assert.deepEqual(await settleRemoteClaudeLogin(pushFailed, confirm), {
      kind: "connected",
      recovered: true,
    });
  });

  it("push failed and anthropic reads disconnected → handoff-failed (an infrastructure error), never paste", async () => {
    const { confirm } = probe(false);
    assert.deepEqual(await settleRemoteClaudeLogin(pushFailed, confirm), {
      kind: "handoff-failed",
      reason: { status: 502 },
    });
  });

  it("extraction failed → handoff-failed immediately, without probing", async () => {
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
