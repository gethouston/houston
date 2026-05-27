import test from "node:test";
import assert from "node:assert/strict";
import { getEffortLevels, validEffortOrDefault } from "./providers.ts";

test("effort levels are per model", () => {
  // Codex: has xhigh, no max.
  assert.deepEqual(getEffortLevels("openai", "gpt-5.5"), [
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
  // Sonnet 4.6: has max, no xhigh.
  assert.deepEqual(getEffortLevels("anthropic", "sonnet"), [
    "low",
    "medium",
    "high",
    "max",
  ]);
  // Opus 4.7: full range.
  assert.deepEqual(getEffortLevels("anthropic", "opus"), [
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
});

test("effort levels empty for unknown / effort-less models", () => {
  assert.deepEqual(getEffortLevels("gemini", "gemini-2.5-pro"), []);
  assert.deepEqual(getEffortLevels(null, null), []);
  assert.deepEqual(getEffortLevels("anthropic", "no-such-model"), []);
});

test("validEffortOrDefault keeps a value the model accepts", () => {
  assert.equal(validEffortOrDefault("anthropic", "sonnet", "max"), "max");
  assert.equal(validEffortOrDefault("openai", "gpt-5.5", "xhigh"), "xhigh");
  assert.equal(validEffortOrDefault("anthropic", "opus", "high"), "high");
});

test("validEffortOrDefault clamps a value the model rejects to the default", () => {
  // Sonnet has no xhigh; codex has no max — both fall back to medium.
  assert.equal(validEffortOrDefault("anthropic", "sonnet", "xhigh"), "medium");
  assert.equal(validEffortOrDefault("openai", "gpt-5.5", "max"), "medium");
});

test("validEffortOrDefault falls back to default when unset or garbage", () => {
  assert.equal(validEffortOrDefault("anthropic", "sonnet", null), "medium");
  assert.equal(validEffortOrDefault("anthropic", "sonnet", "ultra"), "medium");
});

test("validEffortOrDefault is undefined for models without effort control", () => {
  assert.equal(validEffortOrDefault("gemini", "gemini-2.5-pro", "high"), undefined);
});
