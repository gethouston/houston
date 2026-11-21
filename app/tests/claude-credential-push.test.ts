import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ClaudeCredentialPush,
  pushClaudeCredentialWithRetry,
} from "../src/lib/claude-credential-push.ts";

function recorder(outcomes: unknown[] = []) {
  const calls: string[] = [];
  const push: ClaudeCredentialPush = async (json) => {
    calls.push(json);
    const outcome = outcomes[calls.length - 1];
    if (outcome) throw outcome;
  };
  return { calls, push };
}

const noSleep = async () => {};

describe("pushClaudeCredentialWithRetry", () => {
  it("pushes the credential, and nothing else", async () => {
    const { calls, push } = recorder();
    const result = await pushClaudeCredentialWithRetry({
      push,
      credentialJson: '{"claudeAiOauth":{}}',
      sleep: noSleep,
    });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls, ['{"claudeAiOauth":{}}']);
  });

  it("re-sends the SAME credential on every retry", async () => {
    const { calls, push } = recorder([{ status: 503 }, { status: 503 }]);
    const result = await pushClaudeCredentialWithRetry({
      push,
      credentialJson: '{"claudeAiOauth":{}}',
      sleep: noSleep,
    });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(calls, [
      '{"claudeAiOauth":{}}',
      '{"claudeAiOauth":{}}',
      '{"claudeAiOauth":{}}',
    ]);
  });

  it("a terminal failure is reported, never retried", async () => {
    const refused = { status: 403 };
    const { calls, push } = recorder([refused]);
    const result = await pushClaudeCredentialWithRetry({
      push,
      credentialJson: "{}",
      sleep: noSleep,
    });
    assert.deepEqual(result, { ok: false, error: refused });
    assert.equal(calls.length, 1);
  });

  it("gives up after the retry budget and reports the last failure", async () => {
    const down = { status: 500 };
    const { calls, push } = recorder([down, down, down, down, down]);
    const result = await pushClaudeCredentialWithRetry({
      push,
      credentialJson: "{}",
      sleep: noSleep,
    });
    assert.deepEqual(result, { ok: false, error: down });
    assert.equal(calls.length, 4);
  });
});
