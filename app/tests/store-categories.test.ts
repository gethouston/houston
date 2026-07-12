import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isStoreCategory,
  STORE_CATEGORIES,
  storeCategoryLabelKey,
} from "../src/lib/store-categories.ts";

// The store seed (`agentstore/src/db/seed.ts`) is the source of truth; a drift
// here would publish a category slug the store rejects.
const SEED_SLUGS = [
  "writing",
  "productivity",
  "research",
  "marketing",
  "sales",
  "coding",
  "design",
  "data",
  "education",
  "finance",
  "customer-support",
  "personal",
  "fun",
  "other",
];

describe("STORE_CATEGORIES", () => {
  it("matches the seeded store vocabulary exactly and in order", () => {
    strictEqual(STORE_CATEGORIES.length, 14);
    deepStrictEqual([...STORE_CATEGORIES], SEED_SLUGS);
  });

  it("has no duplicate slugs", () => {
    strictEqual(new Set(STORE_CATEGORIES).size, STORE_CATEGORIES.length);
  });
});

describe("isStoreCategory", () => {
  it("accepts seeded slugs and rejects anything else", () => {
    ok(isStoreCategory("finance"));
    ok(isStoreCategory("customer-support"));
    ok(!isStoreCategory("Finance"));
    ok(!isStoreCategory("nope"));
    ok(!isStoreCategory(""));
  });
});

describe("storeCategoryLabelKey", () => {
  it("builds the portable-namespace label key", () => {
    strictEqual(storeCategoryLabelKey("writing"), "publish.categories.writing");
    strictEqual(
      storeCategoryLabelKey("customer-support"),
      "publish.categories.customer-support",
    );
  });
});
