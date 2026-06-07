import test from "node:test";
import assert from "node:assert/strict";
import {
  filterOpenRouterCatalog,
  mergeOpenRouterSlugSelection,
  resolveRecommendedSlugs,
} from "./openrouter-catalog.ts";

const catalog = [
  { id: "openai/gpt-4.1", name: "GPT-4.1", description: "Paid", isFree: false },
  { id: "qwen/qwen3-coder-next", name: "Qwen3 Coder Next", description: "Paid", isFree: false },
  { id: "qwen/qwen3-coder:free", name: "Qwen3 Coder", description: "Free", isFree: true },
];

test("filterOpenRouterCatalog matches id and name", () => {
  assert.equal(filterOpenRouterCatalog(catalog, "qwen").length, 2);
  assert.equal(filterOpenRouterCatalog(catalog, "gpt-4").length, 1);
  assert.equal(filterOpenRouterCatalog(catalog, "missing").length, 0);
});

test("mergeOpenRouterSlugSelection dedupes while preserving order", () => {
  assert.deepEqual(
    mergeOpenRouterSlugSelection(["a/b"], ["c/d", "a/b"]),
    ["a/b", "c/d"],
  );
});

test("resolveRecommendedSlugs keeps only ids present in catalog", () => {
  const paid = resolveRecommendedSlugs(catalog, "paid");
  assert.ok(!paid.includes("openai/gpt-4.1"));
  assert.ok(paid.includes("qwen/qwen3-coder-next"));
  const free = resolveRecommendedSlugs(catalog, "free");
  assert.ok(free.includes("qwen/qwen3-coder:free"));
});
