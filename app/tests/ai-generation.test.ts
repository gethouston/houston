import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAiGenerationProps } from "../src/lib/ai-generation.ts";

describe("buildAiGenerationProps", () => {
  it("maps a full turn to the PostHog $ai_* schema", () => {
    const props = buildAiGenerationProps({
      usage: {
        context_tokens: 12_000,
        output_tokens: 850,
        cached_tokens: 9_000,
      },
      costUsd: 0.042,
      durationMs: 5_432,
      provider: "anthropic",
      model: "claude-sonnet-5",
      sessionKey: "sess-1",
    });
    assert.deepEqual(props, {
      $ai_trace_id: "sess-1",
      $ai_is_error: false,
      $ai_provider: "anthropic",
      $ai_model: "claude-sonnet-5",
      $ai_input_tokens: 12_000,
      $ai_output_tokens: 850,
      $ai_cache_read_input_tokens: 9_000,
      $ai_latency: 5.432,
      $ai_total_cost_usd: 0.042,
    });
  });

  it("still emits a minimal event when the provider reports no usage", () => {
    const props = buildAiGenerationProps({
      usage: null,
      costUsd: null,
      durationMs: 1_000,
      sessionKey: "sess-2",
    });
    assert.deepEqual(props, {
      $ai_trace_id: "sess-2",
      $ai_is_error: false,
      $ai_latency: 1,
    });
  });

  it("omits cost/latency when absent or negative, keeps zero cost", () => {
    const props = buildAiGenerationProps({
      usage: { context_tokens: 1, output_tokens: 2, cached_tokens: 0 },
      costUsd: 0,
      durationMs: -5,
      sessionKey: "sess-3",
    });
    assert.equal(props.$ai_total_cost_usd, 0);
    assert.equal("$ai_latency" in props, false);
  });

  it("never carries prompt or response content keys", () => {
    const props = buildAiGenerationProps({
      usage: { context_tokens: 10, output_tokens: 5, cached_tokens: 0 },
      costUsd: 0.01,
      durationMs: 100,
      provider: "openai",
      model: "gpt-5.5",
      sessionKey: "sess-4",
    });
    for (const key of Object.keys(props)) {
      assert.equal(key.startsWith("$ai_"), true, `unexpected key ${key}`);
    }
    assert.equal("$ai_input" in props, false);
    assert.equal("$ai_output_choices" in props, false);
  });
});
