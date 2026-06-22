import assert from "node:assert/strict";
import test from "node:test";
import {
  getEffortLevels,
  normalizeLegacyModel,
  validEffortOrDefault,
  validModelOrNull,
} from "./providers.ts";

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
  assert.deepEqual(getEffortLevels("unknown-provider", "unknown-model"), []);
  assert.deepEqual(getEffortLevels(null, null), []);
  assert.deepEqual(getEffortLevels("anthropic", "no-such-model"), []);
  // Legacy CLI aliases were retired in favor of explicit version IDs; the
  // engine migrates stored configs (see houston-agent-files), so they are no
  // longer catalog entries.
  assert.deepEqual(getEffortLevels("anthropic", "opus"), []);
  assert.deepEqual(getEffortLevels("anthropic", "sonnet"), []);
});

test("validEffortOrDefault keeps a value the model accepts", () => {
  assert.equal(
    validEffortOrDefault("anthropic", "claude-sonnet-4-6", "max"),
    "max",
  );
  assert.equal(validEffortOrDefault("openai", "gpt-5.5", "xhigh"), "xhigh");
  assert.equal(
    validEffortOrDefault("anthropic", "claude-opus-4-7", "high"),
    "high",
  );
  assert.equal(
    validEffortOrDefault("anthropic", "claude-opus-4-8", "xhigh"),
    "xhigh",
  );
});

test("validEffortOrDefault clamps a value the model rejects to the default", () => {
  // Sonnet has no xhigh; codex has no max — both fall back to medium.
  assert.equal(
    validEffortOrDefault("anthropic", "claude-sonnet-4-6", "xhigh"),
    "medium",
  );
  assert.equal(validEffortOrDefault("openai", "gpt-5.5", "max"), "medium");
});

test("validEffortOrDefault falls back to default when unset or garbage", () => {
  assert.equal(
    validEffortOrDefault("anthropic", "claude-sonnet-4-6", null),
    "medium",
  );
  assert.equal(
    validEffortOrDefault("anthropic", "claude-sonnet-4-6", "ultra"),
    "medium",
  );
});

test("validEffortOrDefault is undefined for models without effort control", () => {
  assert.equal(
    validEffortOrDefault("unknown-provider", "unknown-model", "high"),
    undefined,
  );
});

test("validModelOrNull rejects retired aliases and accepts catalog IDs", () => {
  assert.equal(validModelOrNull("anthropic", "opus"), null);
  assert.equal(validModelOrNull("anthropic", "sonnet"), null);
  assert.equal(
    validModelOrNull("anthropic", "claude-opus-4-8"),
    "claude-opus-4-8",
  );
  assert.equal(
    validModelOrNull("anthropic", "claude-opus-4-7"),
    "claude-opus-4-7",
  );
  assert.equal(
    validModelOrNull("anthropic", "claude-sonnet-4-6"),
    "claude-sonnet-4-6",
  );
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
