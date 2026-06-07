import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { queryKeys } from "./query-keys.ts";
import { OPENROUTER_CATALOG_STALE_MS } from "./openrouter-catalog.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("openRouter catalog query key is stable", () => {
  assert.deepEqual(queryKeys.openRouterCatalog(), ["openrouter-catalog"]);
});

test("catalog stale window is one hour", () => {
  assert.equal(OPENROUTER_CATALOG_STALE_MS, 60 * 60 * 1000);
});

test("warmup hook is wired in App", () => {
  const app = readFileSync(join(root, "App.tsx"), "utf8");
  assert.match(app, /useOpenRouterCatalogWarmup/);
});
