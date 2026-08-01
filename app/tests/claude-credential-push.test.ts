import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ClaudeCredentialPush,
  pushClaudeCredentialWithRetry,
} from "../src/lib/claude-credential-push.ts";

/**
 * The desktop Anthropic browser login's credential push, retry loop included.
 *
 * WHOSE account the mint lands on is decided server-side from the space the push
 * is made in (HOU-976), so the push itself carries a credential and nothing
 * else — the cases below pin the retry contract and the one-argument wire that
 * keeps a scope from creeping back in.
 */

/** A pusher that records exactly what it was called with. */
function recorder(outcomes: unknown[] = []) {
  const calls: string[] = [];
  const push: ClaudeCredentialPush = async (json) => {
    calls.push(json);
    const outcome = outcomes[calls.length - 1];
    if (outcome) throw outcome;
  };
  return { calls, push };
}

/** Retries must not really wait; the delays themselves are pinned elsewhere. */
const noSleep = async () => {};

describe("pushClaudeCredentialWithRetry", () => {
  it("pushes the credential, and nothing else", async () => {
    // One argument, by construction: there is no account to address, so there is
    // no scope for a caller to get backwards.
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
    // A waking pod 503s the first push; the retry must carry the same mint, not
    // a re-read of a dir the first attempt may already have discarded.
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
    // One initial attempt plus one per backoff delay.
    assert.equal(calls.length, 4);
  });
});
