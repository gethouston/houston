import test from "node:test";
import assert from "node:assert/strict";
import {
  decideHandoffMode,
  estimateConversationTokens,
  REPLAY_FIT_FRACTION,
} from "./provider-switch.ts";

// With REPLAY_FIT_FRACTION = 0.8, a 258_400-token window has a 206_720 cutoff.
const GPT_WINDOW = 258_400;
const SONNET_WINDOW = 200_000;

test("decideHandoffMode: replays a small conversation that fits the target window", () => {
  assert.equal(
    decideHandoffMode({
      currentContextTokens: 10_000,
      estimatedTokens: 0,
      targetWindowTokens: GPT_WINDOW,
    }),
    "replay",
  );
});

test("decideHandoffMode: summarizes when the conversation exceeds the fit fraction", () => {
  assert.equal(
    decideHandoffMode({
      currentContextTokens: 250_000,
      estimatedTokens: 0,
      targetWindowTokens: GPT_WINDOW,
    }),
    "summarize",
  );
});

test("decideHandoffMode: respects the exact fit boundary", () => {
  const cutoff = SONNET_WINDOW * REPLAY_FIT_FRACTION; // 160_000
  assert.equal(
    decideHandoffMode({
      currentContextTokens: cutoff,
      estimatedTokens: 0,
      targetWindowTokens: SONNET_WINDOW,
    }),
    "replay",
  );
  assert.equal(
    decideHandoffMode({
      currentContextTokens: cutoff + 1,
      estimatedTokens: 0,
      targetWindowTokens: SONNET_WINDOW,
    }),
    "summarize",
  );
});

test("decideHandoffMode: uses the larger of reported vs estimated size", () => {
  // Reported usage is tiny but the text estimate proves it's big → summarize.
  assert.equal(
    decideHandoffMode({
      currentContextTokens: 1_000,
      estimatedTokens: 240_000,
      targetWindowTokens: GPT_WINDOW,
    }),
    "summarize",
  );
});

test("decideHandoffMode: summarizes (safe default) when the target window is unknown", () => {
  for (const targetWindowTokens of [null, undefined]) {
    assert.equal(
      decideHandoffMode({
        currentContextTokens: 10,
        estimatedTokens: 0,
        targetWindowTokens,
      }),
      "summarize",
    );
  }
});

test("estimateConversationTokens: ~4 chars/token over user + assistant text only", () => {
  const items = [
    { feed_type: "user_message", data: "a".repeat(400) },
    { feed_type: "assistant_text", data: "b".repeat(400) },
    // tool noise is excluded (the engine drops it from the replay too).
    { feed_type: "tool_call", data: { name: "x", input: {} } },
    { feed_type: "final_result", data: { result: "ok" } },
  ];
  assert.equal(estimateConversationTokens(items), 200); // 800 chars / 4
  assert.equal(estimateConversationTokens(undefined), 0);
});
