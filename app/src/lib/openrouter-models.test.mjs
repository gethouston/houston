import test from "node:test";
import assert from "node:assert/strict";
import {
  deserializeOpenRouterModelSlugs,
  formatOpenRouterModelsText,
  isOpenRouterModelSlug,
  openRouterModelOption,
  normalizeOpenRouterModelSlugs,
  openRouterPaidRecommendedModelIds,
  openRouterStarterModelIds,
  isOpenRouterNativeDuplicateSlug,
  openRouterDistinctPaidRecommendedModelIds,
  parseOpenRouterModelsText,
  serializeOpenRouterModelSlugs,
} from "./openrouter-models.ts";

test("isOpenRouterModelSlug accepts provider/model slugs", () => {
  assert.equal(isOpenRouterModelSlug("anthropic/claude-sonnet-4"), true);
  assert.equal(isOpenRouterModelSlug("openai/gpt-4o-mini"), true);
  assert.equal(isOpenRouterModelSlug("qwen/qwen3-coder:free"), true);
  assert.equal(isOpenRouterModelSlug("not-a-slug"), false);
  assert.equal(isOpenRouterModelSlug(""), false);
});

test("parseOpenRouterModelsText dedupes and skips invalid lines", () => {
  const text = "anthropic/claude-sonnet-4\n\nopenai/gpt-4.1\nanthropic/claude-sonnet-4\nbad\n";
  assert.deepEqual(parseOpenRouterModelsText(text), [
    "anthropic/claude-sonnet-4",
    "openai/gpt-4.1",
  ]);
});

test("serialize and deserialize roundtrip", () => {
  const raw = serializeOpenRouterModelSlugs(["openai/gpt-4.1", "google/gemini-2.5-flash"]);
  assert.deepEqual(deserializeOpenRouterModelSlugs(raw), [
    "openai/gpt-4.1",
    "google/gemini-2.5-flash",
  ]);
});

test("deserialize rejects corrupt payloads", () => {
  assert.equal(deserializeOpenRouterModelSlugs(null), null);
  assert.equal(deserializeOpenRouterModelSlugs("not-json"), null);
  assert.equal(deserializeOpenRouterModelSlugs('{"x":1}'), null);
});

test("paid recommended models match curated catalog ids", () => {
  const ids = openRouterPaidRecommendedModelIds();
  assert.ok(ids.length >= 5);
  assert.ok(ids.includes("anthropic/claude-sonnet-4"));
});

test("formatOpenRouterModelsText joins slugs", () => {
  assert.equal(
    formatOpenRouterModelsText(["a/b", "c/d"]),
    "a/b\nc/d",
  );
});

test("openRouterModelOption uses catalog metadata when known", () => {
  const known = openRouterModelOption("openai/gpt-4o-mini");
  assert.equal(known.id, "openai/gpt-4o-mini");
  assert.equal(known.agenticTools, false);
});

test("normalizeOpenRouterModelSlugs falls back to starter defaults", () => {
  assert.deepEqual(normalizeOpenRouterModelSlugs([]), [...openRouterStarterModelIds()]);
  assert.deepEqual(normalizeOpenRouterModelSlugs(["openai/gpt-4.1"]), ["openai/gpt-4.1"]);
});

test("isOpenRouterNativeDuplicateSlug flags anthropic openai and gemini", () => {
  assert.equal(isOpenRouterNativeDuplicateSlug("anthropic/claude-sonnet-4"), true);
  assert.equal(isOpenRouterNativeDuplicateSlug("openai/gpt-4o-mini"), true);
  assert.equal(isOpenRouterNativeDuplicateSlug("google/gemini-2.5-flash"), true);
  assert.equal(isOpenRouterNativeDuplicateSlug("qwen/qwen3-coder-next"), false);
  assert.equal(isOpenRouterNativeDuplicateSlug("google/gemma-3-27b-it:free"), false);
});

test("openRouterDistinctPaidRecommendedModelIds excludes native duplicates", () => {
  const ids = openRouterDistinctPaidRecommendedModelIds();
  assert.ok(!ids.includes("anthropic/claude-sonnet-4"));
  assert.ok(!ids.includes("openai/gpt-4.1"));
  assert.ok(ids.includes("qwen/qwen3-coder-next"));
});

test("openRouterStarterModelIds returns five non-native-duplicate slugs", () => {
  const ids = openRouterStarterModelIds();
  assert.equal(ids.length, 5);
  assert.ok(ids.includes("qwen/qwen3-coder:free"));
  assert.ok(ids.includes("qwen/qwen3-coder-next"));
  for (const id of ids) {
    assert.ok(!id.startsWith("anthropic/"));
    assert.ok(!id.startsWith("openai/"));
    assert.ok(!id.startsWith("google/gemini"));
  }
});

test("openRouterModelOption synthesizes unknown slugs", () => {
  const custom = openRouterModelOption("deepseek/deepseek-chat-v3");
  assert.equal(custom.id, "deepseek/deepseek-chat-v3");
  assert.equal(custom.label, "deepseek chat v3");
});
