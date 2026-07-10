import assert from "node:assert/strict";
import test from "node:test";
import { loadHubCatalog } from "./catalog.ts";

const model = (id, name) => ({
  id,
  name,
  pricing: { input: 1, output: 2 },
  contextWindow: 200000,
  maxTokens: 8192,
  reasoning: false,
  vision: false,
});

const CATALOG = [
  {
    id: "anthropic",
    name: "anthropic",
    auth: "oauth",
    models: [model("claude-sonnet-5", "Claude Sonnet 5")],
  },
  {
    id: "openrouter",
    name: "openrouter",
    auth: "apiKey",
    models: [model("x/y", "Some Router Model")],
  },
];

test("loadHubCatalog without a visibility set includes every runnable provider", () => {
  const hub = loadHubCatalog(CATALOG, { enrich: false });
  assert.ok(hub.byProvider.has("anthropic"));
  assert.ok(hub.byProvider.has("openrouter"));
  assert.equal(hub.modelCount, 2);
});

test("loadHubCatalog scopes to visibleProviderIds so it matches the picker's set", () => {
  // The hub must show EXACTLY the providers getVisibleProviders shows. A provider
  // absent from the visible set (gated / coming-soon) contributes no hub models,
  // so the AI Models tab can never surface a model the picker won't offer.
  const hub = loadHubCatalog(CATALOG, {
    enrich: false,
    visibleProviderIds: new Set(["anthropic"]),
  });
  assert.ok(hub.byProvider.has("anthropic"));
  assert.ok(!hub.byProvider.has("openrouter"));
  assert.equal(hub.modelCount, 1);
});
