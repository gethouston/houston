import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcTokenCost } from "../src/lib/token-pricing.ts";

// Prices verified June 2026:
//   Claude — platform.claude.com/docs/en/docs/about-claude/pricing
//   OpenAI — developers.openai.com/api/docs/pricing

describe("calcTokenCost", () => {
  it("returns null for an unpriced model (e.g. Gemini)", () => {
    assert.equal(calcTokenCost("gemini-2.5-pro", 1000, 100, 0), null);
  });

  it("computes Claude Sonnet 4.6 cost (input $3, output $15)", () => {
    const cost = calcTokenCost("claude-sonnet-4-6", 100_000, 10_000, 0);
    assert.ok(cost != null);
    const expected = (100_000 * 3.0 + 10_000 * 15.0) / 1_000_000;
    assert.ok(Math.abs(cost - expected) < 1e-9);
  });

  it("computes Claude Opus 4.8 cost (input $5, output $25)", () => {
    const cost = calcTokenCost("claude-opus-4-8", 100_000, 10_000, 0);
    assert.ok(cost != null);
    const expected = (100_000 * 5.0 + 10_000 * 25.0) / 1_000_000;
    assert.ok(Math.abs(cost - expected) < 1e-9);
  });

  it("bills Claude cached tokens at the 0.1x cache-read rate", () => {
    // Sonnet: cacheRead $0.30. 50K fresh + 50K cached + 5K output.
    const cost = calcTokenCost("claude-sonnet-4-6", 100_000, 5_000, 50_000);
    assert.ok(cost != null);
    const expected = (50_000 * 3.0 + 50_000 * 0.3 + 5_000 * 15.0) / 1_000_000;
    assert.ok(Math.abs(cost - expected) < 1e-9);
  });

  it("computes gpt-5.5 cost (input $5, output $30)", () => {
    const cost = calcTokenCost("gpt-5.5", 100_000, 10_000, 0);
    assert.ok(cost != null);
    const expected = (100_000 * 5.0 + 10_000 * 30.0) / 1_000_000;
    assert.ok(Math.abs(cost - expected) < 1e-9);
  });

  it("resolves legacy 'sonnet' alias to claude-sonnet-4-6", () => {
    assert.equal(
      calcTokenCost("sonnet", 100_000, 10_000, 0),
      calcTokenCost("claude-sonnet-4-6", 100_000, 10_000, 0),
    );
  });

  it("resolves legacy 'opus' alias to claude-opus-4-7", () => {
    assert.equal(
      calcTokenCost("opus", 100_000, 10_000, 0),
      calcTokenCost("claude-opus-4-7", 100_000, 10_000, 0),
    );
  });

  it("resolves a suffixed model id to its base rate via prefix match", () => {
    assert.equal(
      calcTokenCost("claude-sonnet-4-6-20260101", 10_000, 1_000, 0),
      calcTokenCost("claude-sonnet-4-6", 10_000, 1_000, 0),
    );
  });

  it("returns zero for zero tokens", () => {
    assert.equal(calcTokenCost("claude-sonnet-4-6", 0, 0, 0), 0);
  });

  it("clamps fresh tokens to zero when cachedTokens exceeds contextTokens", () => {
    const cost = calcTokenCost("claude-sonnet-4-6", 1_000, 100, 5_000);
    assert.ok(cost != null && cost >= 0);
  });
});
