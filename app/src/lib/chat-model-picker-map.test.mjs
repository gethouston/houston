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

const curatedModel = {
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
  models: [curatedModel, orModel],
  byKey: new Map([
    ["m1", curatedModel],
    ["or1", orModel],
  ]),
  byProvider: new Map([
    ["testprov", [curatedModel]],
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
const orProv = {
  id: "openrouter",
  name: "OpenRouter",
  subtitle: "",
  models: [],
};
// OpenRouter as it really is in PROVIDERS: a small curated list used as the
// cold-start stand-in shown only while the catalog is still loading.
const orProvCurated = {
  id: "openrouter",
  name: "OpenRouter",
  subtitle: "",
  models: [
    {
      id: "anthropic/claude-sonnet-4.6",
      label: "Claude Sonnet",
      description: "curated",
    },
    { id: "openrouter/free", label: "Free model", description: "free curated" },
  ],
};
const localProv = {
  id: "openai-compatible",
  name: "Local",
  subtitle: "Ollama…",
  models: [],
};

test("buildPickerModels: a curated row is enriched from its matching catalog offer", () => {
  const [m] = buildPickerModels({
    visibleProviders: [testProv],
    statuses: {},
    catalog,
    now: NOW,
  });
  assert.equal(m.id, "testprov::m1");
  assert.equal(m.providerId, "testprov");
  assert.equal(m.name, "M1 label"); // the curated label, not the catalog name
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

test("buildPickerModels: a curated row with no catalog match falls back gracefully", () => {
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

test("buildPickerModels: OpenRouter rows come from the live catalog, preserving the run id", () => {
  const models = buildPickerModels({
    visibleProviders: [orProv],
    statuses: {},
    catalog,
    now: NOW,
  });
  assert.equal(models.length, 1);
  const [m] = models;
  assert.equal(m.id, "openrouter::vendor/or-1"); // upstream id preserved
  assert.equal(decodeModelPickerId(m.id).model, "vendor/or-1");
  assert.equal(m.name, "OR One");
  assert.equal(m.priceTier, "free"); // costInput 0
  assert.deepEqual(m.capabilities, {
    vision: false,
    reasoning: true,
    tools: false,
    imageGen: true,
  });
});

test("buildPickerModels: OpenRouter falls back to curated models while the catalog is still loading", () => {
  const models = buildPickerModels({
    visibleProviders: [orProvCurated],
    statuses: {},
    catalog: undefined, // cold start: catalog not yet loaded (the only fallback case)
    now: NOW,
  });
  assert.equal(models.length, 2);
  assert.deepEqual(
    models.map((m) => m.id),
    ["openrouter::anthropic/claude-sonnet-4.6", "openrouter::openrouter/free"],
  );
  // Curated rows are runnable pairs, just un-enriched without a catalog match.
  assert.equal(models[0].providerId, "openrouter");
  assert.deepEqual(models[0].capabilities, {
    vision: false,
    reasoning: false,
    tools: false,
    imageGen: false,
  });
});

test("buildPickerModels: OpenRouter prefers the live catalog over curated when both exist", () => {
  const models = buildPickerModels({
    visibleProviders: [orProvCurated],
    statuses: {},
    catalog, // has one live OpenRouter model (vendor/or-1)
    now: NOW,
  });
  // Live wins outright: the single live model, curated not appended (no dupes).
  assert.equal(models.length, 1);
  assert.equal(models[0].id, "openrouter::vendor/or-1");
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

test("buildPickerModels: the describe callback localizes a curated row's description", () => {
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
