import test from "node:test";
import assert from "node:assert/strict";
import {
  getEffortLevels,
  getProvider,
  modelSupportsAgenticTools,
  validEffortOrDefault,
  validModelOrNull,
  normalizeLegacyModel,
} from "./providers.ts";

test("catalog loginKind drives connect flows", () => {
  assert.equal(getProvider("anthropic")?.loginKind, "oauth");
  assert.equal(getProvider("openai")?.loginKind, "oauth");
  assert.equal(getProvider("openrouter")?.loginKind, "apiKey");
});

test("effort levels are per model", () => {
  // Codex: has xhigh, no max.
  assert.deepEqual(getEffortLevels("openai", "gpt-5.5"), [
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
  // Sonnet 4.6: has max, no xhigh.
  assert.deepEqual(getEffortLevels("anthropic", "claude-sonnet-4-6"), [
    "low",
    "medium",
    "high",
    "max",
  ]);
  // Opus 4.7: full range.
  assert.deepEqual(getEffortLevels("anthropic", "claude-opus-4-7"), [
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  // Opus 4.8: full range, identical to 4.7. `ultracode` is a Claude Code
  // harness mode, not an effort level — it must never appear here.
  assert.deepEqual(getEffortLevels("anthropic", "claude-opus-4-8"), [
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
});

test("effort levels empty for unknown / effort-less models", () => {
  assert.deepEqual(getEffortLevels("openrouter", "anthropic/claude-sonnet-4"), []);
  assert.deepEqual(getEffortLevels(null, null), []);
  assert.deepEqual(getEffortLevels("anthropic", "no-such-model"), []);
  // Legacy CLI aliases were retired in favor of explicit version IDs; the
  // engine migrates stored configs (see houston-agent-files), so they are no
  // longer catalog entries.
  assert.deepEqual(getEffortLevels("anthropic", "opus"), []);
  assert.deepEqual(getEffortLevels("anthropic", "sonnet"), []);
});

test("validEffortOrDefault keeps a value the model accepts", () => {
  assert.equal(validEffortOrDefault("anthropic", "claude-sonnet-4-6", "max"), "max");
  assert.equal(validEffortOrDefault("openai", "gpt-5.5", "xhigh"), "xhigh");
  assert.equal(validEffortOrDefault("anthropic", "claude-opus-4-7", "high"), "high");
  assert.equal(validEffortOrDefault("anthropic", "claude-opus-4-8", "xhigh"), "xhigh");
});

test("validEffortOrDefault clamps a value the model rejects to the default", () => {
  // Sonnet has no xhigh; codex has no max — both fall back to medium.
  assert.equal(validEffortOrDefault("anthropic", "claude-sonnet-4-6", "xhigh"), "medium");
  assert.equal(validEffortOrDefault("openai", "gpt-5.5", "max"), "medium");
});

test("validEffortOrDefault falls back to default when unset or garbage", () => {
  assert.equal(validEffortOrDefault("anthropic", "claude-sonnet-4-6", null), "medium");
  assert.equal(validEffortOrDefault("anthropic", "claude-sonnet-4-6", "ultra"), "medium");
});

test("validEffortOrDefault is undefined for models without effort control", () => {
  assert.equal(
    validEffortOrDefault("openrouter", "anthropic/claude-sonnet-4", "high"),
    undefined,
  );
});

test("validModelOrNull rejects retired aliases and accepts catalog IDs", () => {
  assert.equal(validModelOrNull("anthropic", "opus"), null);
  assert.equal(validModelOrNull("anthropic", "sonnet"), null);
  assert.equal(validModelOrNull("anthropic", "claude-opus-4-8"), "claude-opus-4-8");
  assert.equal(validModelOrNull("anthropic", "claude-opus-4-7"), "claude-opus-4-7");
  assert.equal(validModelOrNull("anthropic", "claude-sonnet-4-6"), "claude-sonnet-4-6");
});

test("normalizeLegacyModel maps retired aliases, passes everything else through", () => {
  assert.equal(normalizeLegacyModel("opus"), "claude-opus-4-7");
  assert.equal(normalizeLegacyModel("sonnet"), "claude-sonnet-4-6");
  // Already-explicit IDs and other providers' models are untouched.
  assert.equal(normalizeLegacyModel("claude-opus-4-8"), "claude-opus-4-8");
  assert.equal(normalizeLegacyModel("gpt-5.5"), "gpt-5.5");
  // null/undefined return null so it composes in `??` chains.
  assert.equal(normalizeLegacyModel(null), null);
  assert.equal(normalizeLegacyModel(undefined), null);
  // Object-prototype keys are not aliases: a hand-edited config must pass
  // through, never resolve to an Object.prototype member.
  assert.equal(normalizeLegacyModel("constructor"), "constructor");
  assert.equal(normalizeLegacyModel("__proto__"), "__proto__");
  assert.equal(normalizeLegacyModel("toString"), "toString");
});

test("modelSupportsAgenticTools defaults true for catalog OpenRouter models", () => {
  assert.equal(
    modelSupportsAgenticTools("openrouter", "anthropic/claude-sonnet-4"),
    true,
  );
  assert.equal(modelSupportsAgenticTools("openrouter", "openai/gpt-4.1"), true);
  assert.equal(
    modelSupportsAgenticTools("openrouter", "google/gemini-2.5-flash"),
    true,
  );
  assert.equal(
    modelSupportsAgenticTools("openrouter", "qwen/qwen3-coder-next"),
    true,
  );
  assert.equal(modelSupportsAgenticTools("anthropic", "claude-sonnet-4-6"), true);
});

test("modelSupportsAgenticTools rejects chat-only OpenRouter models", () => {
  assert.equal(
    modelSupportsAgenticTools("openrouter", "openai/gpt-4o-mini"),
    false,
  );
  assert.equal(
    modelSupportsAgenticTools("openrouter", "meta-llama/llama-3.3-70b-instruct"),
    false,
  );
  assert.equal(
    modelSupportsAgenticTools("openrouter", "meta-llama/llama-3.3-70b-instruct:free"),
    false,
  );
});

test("modelSupportsAgenticTools allows curated free OpenRouter models", () => {
  assert.equal(
    modelSupportsAgenticTools("openrouter", "qwen/qwen3-coder:free"),
    true,
  );
  assert.equal(
    modelSupportsAgenticTools("openrouter", "mistralai/mistral-small-3.1-24b-instruct:free"),
    true,
  );
});

test("modelSupportsAgenticTools treats user OpenRouter slugs as agentic-capable", () => {
  assert.equal(
    modelSupportsAgenticTools("openrouter", "deepseek/deepseek-chat-v3-0324"),
    true,
  );
  assert.equal(modelSupportsAgenticTools("anthropic", "unknown-model"), true);
});

test("validModelOrNull keeps curated and custom OpenRouter slugs", () => {
  assert.equal(
    validModelOrNull("openrouter", "deepseek/deepseek-chat-v3-0324"),
    "deepseek/deepseek-chat-v3-0324",
  );
  assert.equal(
    validModelOrNull("openrouter", "google/gemini-2.5-flash"),
    "google/gemini-2.5-flash",
  );
  assert.equal(
    validModelOrNull("openrouter", "qwen/qwen3-coder:free"),
    "qwen/qwen3-coder:free",
  );
  assert.equal(
    validModelOrNull("openrouter", "meta-llama/llama-3.3-70b-instruct:free"),
    "meta-llama/llama-3.3-70b-instruct:free",
  );
  assert.equal(validModelOrNull("openrouter", "not-a-slug"), null);
});

test("normalized legacy model resolves through validModelOrNull (no Opus->Sonnet downgrade)", () => {
  // The chat panel normalizes a stored model before validModelOrNull: a legacy
  // "opus" must resolve to Opus 4.7, never fall through to the Sonnet default.
  assert.equal(
    validModelOrNull("anthropic", normalizeLegacyModel("opus")),
    "claude-opus-4-7",
  );
  assert.equal(
    validModelOrNull("anthropic", normalizeLegacyModel("sonnet")),
    "claude-sonnet-4-6",
  );
});
