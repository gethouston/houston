import assert from "node:assert/strict";
import test from "node:test";
import {
  contextFillPercent,
  effectiveContextWindow,
  sessionContextUsage,
} from "./context-usage.ts";

function finalResult(contextTokens) {
  return {
    feed_type: "final_result",
    data: {
      result: "x",
      cost_usd: null,
      duration_ms: null,
      usage: {
        context_tokens: contextTokens,
        output_tokens: 0,
        cached_tokens: 0,
      },
    },
  };
}
const providerSwitched = {
  feed_type: "provider_switched",
  data: { provider: "openai", summarized: true },
};

test("sessionContextUsage: tracks latest + peak within one provider segment", () => {
  const r = sessionContextUsage([
    finalResult(50_000),
    finalResult(120_000),
    finalResult(90_000),
  ]);
  assert.equal(r.latest.context_tokens, 90_000);
  assert.equal(r.peakContextTokens, 120_000);
});

test("sessionContextUsage: provider_switched resets peak + latest to the new provider's segment", () => {
  const r = sessionContextUsage([
    finalResult(280_000),
    finalResult(300_000),
    providerSwitched,
    finalResult(19_197),
  ]);
  assert.equal(r.latest.context_tokens, 19_197);
  assert.equal(r.peakContextTokens, 19_197);
});

test("sessionContextUsage: latest is null right after a switch, before the new provider reports", () => {
  const r = sessionContextUsage([finalResult(280_000), providerSwitched]);
  assert.equal(r.latest, null);
  assert.equal(r.peakContextTokens, 0);
});

test("effectiveContextWindow: a cross-provider peak no longer snaps the new window up (the reported bug)", () => {
  const gpt = { default: 258_400, max: 950_000 };
  const { latest, peakContextTokens } = sessionContextUsage([
    finalResult(300_000),
    providerSwitched,
    finalResult(19_197),
  ]);
  const window = effectiveContextWindow(gpt, peakContextTokens);
  assert.equal(window, 215_054);
  assert.equal(contextFillPercent(latest, window), 9);
});

test("effectiveContextWindow: still snaps up within the SAME provider when its own usage proves a larger window", () => {
  const sonnet = { default: 200_000, max: 1_000_000 };
  const { peakContextTokens } = sessionContextUsage([
    finalResult(120_000),
    finalResult(240_000),
  ]);
  assert.equal(effectiveContextWindow(sonnet, peakContextTokens), 215_054);
});
