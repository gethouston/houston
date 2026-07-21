import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeModelPickerId,
  encodeModelPickerId,
  resolveSelectedModelId,
} from "./chat-model-picker-ids.ts";
import {
  buildPickerModels,
  buildPickerProviders,
  rankCuratedFirst,
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

// ── model list building ───────────────────────────────────────────────────

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
    { id: "vendor/or-1", label: "OR One label", description: "or curated" },
  ],
};
const localProv = {
  id: "openai-compatible",
  name: "Local",
  subtitle: "Ollama…",
  models: [],
};

test("buildPickerModels: a provider row carries only id, provider, name, description", () => {
  const [m] = buildPickerModels({ visibleProviders: [testProv], statuses: {} });
  assert.deepEqual(m, {
    id: "testprov::m1",
    providerId: "testprov",
    name: "M1 label", // the PROVIDERS label, not any catalog name
    description: "curated desc",
  });
});

test("buildPickerModels: every provider is built by one uniform path, in order", () => {
  const models = buildPickerModels({
    visibleProviders: [testProv, orProv],
    statuses: {},
  });
  assert.deepEqual(
    models.map((m) => m.id),
    ["testprov::m1", "openrouter::vendor/or-1"],
  );
  // openrouter-native id preserved through the codec.
  assert.equal(decodeModelPickerId(models[1].id).model, "vendor/or-1");
  assert.equal(models[1].name, "OR One label");
});

test("buildPickerModels: the catalog-less local provider surfaces its runtime model", () => {
  const models = buildPickerModels({
    visibleProviders: [localProv],
    statuses: { "openai-compatible": { active_model: "llama3.1" } },
  });
  assert.equal(models.length, 1);
  assert.equal(models[0].id, "openai-compatible::llama3.1");
  assert.equal(models[0].name, "llama3.1");
});

test("buildPickerModels: a local provider with no runtime model yet yields no rows", () => {
  const models = buildPickerModels({
    visibleProviders: [localProv],
    statuses: {},
  });
  assert.deepEqual(models, []);
});

test("buildPickerModels: the describe callback localizes a provider row's description", () => {
  const [m] = buildPickerModels({
    visibleProviders: [testProv],
    statuses: {},
    describe: (_p, id, fallback) => `t:${id}:${fallback}`,
  });
  assert.equal(m.description, "t:m1:curated desc");
});

// ── curated-first ranking ─────────────────────────────────────────────────

test("rankCuratedFirst: curated ids lead in curation order, rest keep input order", () => {
  const rows = [
    { id: "legacy-1" },
    { id: "flagship-b" },
    { id: "legacy-2" },
    { id: "flagship-a" },
  ];
  assert.deepEqual(
    rankCuratedFirst(rows, ["flagship-a", "flagship-b"]).map((r) => r.id),
    ["flagship-a", "flagship-b", "legacy-1", "legacy-2"],
  );
});

test("rankCuratedFirst: no curated ids is an order-preserving copy", () => {
  const rows = [{ id: "b" }, { id: "a" }];
  const out = rankCuratedFirst(rows, []);
  assert.deepEqual(out, rows);
  assert.notEqual(out, rows); // fresh array, input not aliased
});

test("rankCuratedFirst: curated ids missing from the rows are simply skipped", () => {
  const rows = [{ id: "x" }, { id: "flag" }];
  assert.deepEqual(
    rankCuratedFirst(rows, ["not-runnable", "flag"]).map((r) => r.id),
    ["flag", "x"],
  );
});

test("buildPickerModels: a real provider's rows rank curated-first", () => {
  // Raw pi-catalog order: legacy models first — the defect this ranking fixes.
  const anthropic = {
    id: "anthropic",
    name: "Anthropic",
    subtitle: "",
    models: [
      { id: "claude-opus-3", label: "Claude Opus 3", description: "" },
      { id: "claude-sonnet-3-5", label: "Claude Sonnet 3.5", description: "" },
      { id: "claude-opus-4-7", label: "Claude Opus 4.7", description: "" },
      { id: "claude-fable-5", label: "Fable 5", description: "" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8", description: "" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "" },
    ],
  };
  const models = buildPickerModels({
    visibleProviders: [anthropic],
    statuses: {},
  });
  // Curated (PROVIDER_OVERRIDES.anthropic.models key order: sonnet-5 [absent
  // from this provider's rows, so skipped], fable-5, opus-4-8, opus-4-7,
  // sonnet-4-6) first, then the uncurated legacy rows in catalog order.
  assert.deepEqual(
    models.map((m) => decodeModelPickerId(m.id).model),
    [
      "claude-fable-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-sonnet-4-6",
      "claude-opus-3",
      "claude-sonnet-3-5",
    ],
  );
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
      // No status + not loading → disconnected (the picker hides it; the only
      // path to it is the "Connect more providers…" footer).
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
