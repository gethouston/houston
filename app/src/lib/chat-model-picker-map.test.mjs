import assert from "node:assert/strict";
import test from "node:test";
import { isRecentRelease } from "./chat-model-picker-enrich.ts";
import {
  decodeModelPickerId,
  encodeModelPickerId,
  resolveSelectedModelId,
} from "./chat-model-picker-ids.ts";
import {
  buildPickerModels,
  buildPickerProviders,
} from "./chat-model-picker-map.ts";

// ── id encode / decode ────────────────────────────────────────────────────

test("encode/decode round-trips ids that contain single colons and slashes", () => {
  for (const [p, m] of [
    ["anthropic", "claude-sonnet-4-6"],
    ["amazon-bedrock", "amazon.nova-pro-v1:0"], // single colon in the model id
    ["openrouter", "anthropic/claude-sonnet-4.6"], // slash + dot
  ]) {
    const id = encodeModelPickerId(p, m);
    assert.deepEqual(decodeModelPickerId(id), { provider: p, model: m });
  }
});

test("decode of a separator-less id yields an empty model", () => {
  assert.deepEqual(decodeModelPickerId("anthropic"), {
    provider: "anthropic",
    model: "",
  });
});

// ── selected-id resolution ────────────────────────────────────────────────

test("resolveSelectedModelId: catalog-less provider resolves to the runtime model", () => {
  const local = { id: "openai-compatible", models: [], subtitle: "Local" };
  assert.equal(resolveSelectedModelId(local, "", "llama3.1"), "llama3.1");
  // A catalogued provider keeps its stored model, ignoring any runtime value.
  const anthropic = { id: "anthropic", models: [{ id: "x" }], subtitle: "" };
  assert.equal(
    resolveSelectedModelId(anthropic, "claude", "ignored"),
    "claude",
  );
});

// ── recency badge ─────────────────────────────────────────────────────────

test("isRecentRelease: only a date within the window and not in the future is new", () => {
  const now = Date.parse("2026-07-06");
  assert.equal(isRecentRelease("2026-06-30", now), true);
  assert.equal(isRecentRelease("2026-01-01", now), false); // too old
  assert.equal(isRecentRelease("2026-12-01", now), false); // future
  assert.equal(isRecentRelease(undefined, now), false);
  assert.equal(isRecentRelease("not-a-date", now), false);
});

// ── model list building ───────────────────────────────────────────────────

const RECENT = "2026-06-30";
const NOW = Date.parse("2026-07-06");

const testModel = {
  key: "m1",
  name: "M1",
  lab: "other",
  description: "catalog desc",
  reasoning: true,
  toolCall: true,
  imageGen: false,
  inputModalities: ["text", "image"],
  releaseDate: RECENT,
  context: 123456,
  offers: [
    {
      providerId: "testprov",
      modelId: "m1",
      costInput: 2,
      costOutput: 6,
      context: 123456,
      subscription: true,
    },
  ],
};

// An OpenRouter model in the hub catalog, keyed by its openrouter-native offer id
// so the offer index enriches the matching PROVIDERS row.
const orModel = {
  key: "or1",
  name: "OR One",
  lab: "anthropic",
  description: "or desc",
  reasoning: true,
  toolCall: false,
  imageGen: true,
  inputModalities: ["text"],
  releaseDate: "2000-01-01",
  context: 200000,
  offers: [
    {
      providerId: "openrouter",
      modelId: "vendor/or-1",
      costInput: 0,
      costOutput: 0,
      context: 200000,
      subscription: false,
    },
  ],
};

const catalog = {
  models: [testModel, orModel],
  byKey: new Map([
    ["m1", testModel],
    ["or1", orModel],
  ]),
  byProvider: new Map([
    ["testprov", [testModel]],
    ["openrouter", [orModel]],
  ]),
  modelCount: 2,
  offerCount: 2,
};

const testProv = {
  id: "testprov",
  name: "Test",
  subtitle: "sub",
  models: [{ id: "m1", label: "M1 label", description: "curated desc" }],
};
// OpenRouter is no longer special: `PROVIDERS` carries its full runnable set as
// ordinary rows (hydrated from the pi-ai catalog), built by the SAME path as
// every other provider.
const orProv = {
  id: "openrouter",
  name: "OpenRouter",
  subtitle: "",
  models: [
    {
      id: "vendor/or-1",
      label: "OR One label",
      description: "or curated",
    },
  ],
};
const localProv = {
  id: "openai-compatible",
  name: "Local",
  subtitle: "Ollama…",
  models: [],
};

test("buildPickerModels: a provider row is enriched from its matching catalog offer", () => {
  const [m] = buildPickerModels({
    visibleProviders: [testProv],
    statuses: {},
    catalog,
    now: NOW,
  });
  assert.equal(m.id, "testprov::m1");
  assert.equal(m.providerId, "testprov");
  assert.equal(m.name, "M1 label"); // the PROVIDERS label, not the catalog name
  assert.deepEqual(m.capabilities, {
    vision: true,
    reasoning: true,
    tools: true,
    imageGen: false,
  });
  assert.equal(m.priceTier, "mid"); // cheapest input 2 → mid
  assert.equal(m.priceInPerMtok, 2);
  assert.equal(m.priceOutPerMtok, 6);
  assert.equal(m.contextWindow, 123456);
  assert.equal(m.isNew, true);
});

test("buildPickerModels: a provider row with no catalog match falls back gracefully", () => {
  const [m] = buildPickerModels({
    visibleProviders: [testProv],
    statuses: {},
    catalog: undefined, // no catalog loaded yet
    now: NOW,
  });
  assert.equal(m.id, "testprov::m1");
  assert.deepEqual(m.capabilities, {
    vision: false,
    reasoning: false,
    tools: false,
    imageGen: false,
  });
  assert.equal(m.priceTier, undefined);
  // testprov isn't a real Houston provider, so no static context window either.
  assert.equal(m.contextWindow, undefined);
  assert.equal(m.isNew, undefined);
});

test("buildPickerModels: OpenRouter sources rows from PROVIDERS, enriched by the offer index", () => {
  const models = buildPickerModels({
    visibleProviders: [orProv],
    statuses: {},
    catalog,
    now: NOW,
  });
  // One PROVIDERS row → one picker row, built by the uniform path (NOT byProvider).
  assert.equal(models.length, 1);
  const [m] = models;
  assert.equal(m.id, "openrouter::vendor/or-1"); // openrouter-native id preserved
  assert.equal(decodeModelPickerId(m.id).model, "vendor/or-1");
  assert.equal(m.name, "OR One label"); // the PROVIDERS label, not the catalog name
  assert.equal(m.priceTier, "free"); // enriched: costInput 0
  assert.deepEqual(m.capabilities, {
    vision: false,
    reasoning: true,
    tools: false,
    imageGen: true,
  });
});

test("buildPickerModels: every provider (incl openrouter) is built by one uniform path", () => {
  const models = buildPickerModels({
    visibleProviders: [testProv, orProv],
    statuses: {},
    catalog,
    now: NOW,
  });
  // Both providers contribute their PROVIDERS rows in order, each enriched by the
  // `${providerId}::${modelId}` offer index — no per-provider branch.
  assert.deepEqual(
    models.map((m) => m.id),
    ["testprov::m1", "openrouter::vendor/or-1"],
  );
  assert.equal(models[0].priceTier, "mid");
  assert.equal(models[1].priceTier, "free");
});

test("buildPickerModels: an OpenRouter row with no catalog match still renders (un-enriched)", () => {
  const models = buildPickerModels({
    visibleProviders: [orProv],
    statuses: {},
    catalog: undefined, // cold start: catalog not yet loaded
    now: NOW,
  });
  assert.equal(models.length, 1);
  assert.equal(models[0].id, "openrouter::vendor/or-1");
  assert.equal(models[0].providerId, "openrouter");
  assert.deepEqual(models[0].capabilities, {
    vision: false,
    reasoning: false,
    tools: false,
    imageGen: false,
  });
});

test("buildPickerModels: the catalog-less local provider surfaces its runtime model", () => {
  const models = buildPickerModels({
    visibleProviders: [localProv],
    statuses: { "openai-compatible": { active_model: "llama3.1" } },
    catalog,
    now: NOW,
  });
  assert.equal(models.length, 1);
  assert.equal(models[0].id, "openai-compatible::llama3.1");
  assert.equal(models[0].name, "llama3.1");
});

test("buildPickerModels: the describe callback localizes a provider row's description", () => {
  const [m] = buildPickerModels({
    visibleProviders: [testProv],
    statuses: {},
    catalog,
    now: NOW,
    describe: (_p, id, fallback) => `t:${id}:${fallback}`,
  });
  assert.equal(m.description, "t:m1:curated desc");
});

// ── provider list building ────────────────────────────────────────────────

test("buildPickerProviders: keeps only providers that own models, with connection state", () => {
  const providers = buildPickerProviders({
    visibleProviders: [testProv, orProv, localProv],
    statuses: {
      testprov: { cli_installed: true, authenticated: true },
    },
    isLoading: false,
    withModels: new Set(["testprov", "openrouter"]), // localProv dropped
  });
  assert.deepEqual(
    providers.map((p) => [p.id, p.connection]),
    [
      ["testprov", "connected"],
      // No status + not loading → disconnected (still shown, offers Connect).
      ["openrouter", "disconnected"],
    ],
  );
});

test("buildPickerProviders: an absent status while loading reads as 'checking' (#342)", () => {
  const [p] = buildPickerProviders({
    visibleProviders: [testProv],
    statuses: {},
    isLoading: true,
    withModels: new Set(["testprov"]),
  });
  assert.equal(p.connection, "checking");
});
