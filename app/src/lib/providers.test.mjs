import assert from "node:assert/strict";
import test from "node:test";
import {
  EFFORT_ORDER,
  getConnectProviders,
  getContextWindowConfig,
  getEffortLevels,
  getProvider,
  getVisibleProviders,
  hydrateProviderCatalog,
  normalizeLegacyModel,
  PROVIDERS,
  providerGatewayIds,
  validEffortOrDefault,
  validModelOrNull,
} from "./providers.ts";

const PI_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];
const rm = (id, ctx) => ({
  id,
  name: id,
  pricing: { input: 1, output: 2 },
  contextWindow: ctx,
  maxTokens: 8192,
  reasoning: true,
  vision: false,
  thinkingLevels: PI_LEVELS,
});
const tm = (id, ctx) => ({
  id,
  name: id,
  pricing: { input: 1, output: 2 },
  contextWindow: ctx,
  maxTokens: 8192,
  reasoning: false,
  vision: false,
});
const prov = (id, auth, models) => ({ id, name: id, auth, models });

const SAMPLE_CATALOG = [
  prov("openai", "apiKey", [tm("gpt-4o", 128000)]),
  prov("openai-codex", "oauth", [
    rm("gpt-5.5", 272000),
    rm("gpt-5.4", 272000),
    rm("gpt-5.4-mini", 272000),
    rm("gpt-5.3-codex-spark", 128000),
  ]),
  prov("anthropic", "oauth", [
    rm("claude-sonnet-5", 1000000),
    rm("claude-sonnet-4-6", 200000),
    rm("claude-opus-4-8", 1000000),
    rm("claude-fable-5", 1000000),
    rm("claude-opus-4-7", 1000000),
  ]),
  prov("github-copilot", "oauth", [
    tm("gpt-4.1", 200000),
    rm("claude-sonnet-4.6", 1000000),
    rm("claude-opus-4.8", 200000),
    tm("claude-haiku-4.5", 200000),
    rm("gpt-5.5", 400000),
    rm("gpt-5-mini", 264000),
    rm("gemini-3.6-flash", 128000),
  ]),
  prov("opencode", "apiKey", [
    rm("claude-sonnet-4-6", 1000000),
    rm("claude-opus-4-8", 1000000),
    rm("gpt-5.5", 1050000),
    rm("gemini-3.5-flash", 1048576),
    rm("deepseek-v4-flash-free", 200000),
    tm("mimo-v2.5-free", 200000),
    tm("nemotron-3-ultra-free", 1000000),
  ]),
  prov("opencode-go", "apiKey", [
    tm("glm-5.1", 202752),
    tm("kimi-k2.6", 262144),
    rm("minimax-m3", 512000),
    tm("qwen3.7-max", 1000000),
    rm("deepseek-v4-pro", 1000000),
  ]),
  prov("openrouter", "apiKey", [
    tm("openrouter/free", 200000),
    rm("anthropic/claude-sonnet-4.6", 1000000),
    rm("anthropic/claude-opus-4.8", 1000000),
    rm("google/gemini-3-flash-preview", 1048576),
    rm("deepseek/deepseek-v4-pro", 1048576),
  ]),
  prov("deepseek", "apiKey", [
    rm("deepseek-v4-flash", 1000000),
    rm("deepseek-v4-pro", 1000000),
  ]),
  prov("google", "apiKey", [
    rm("gemini-3.5-flash", 1048576),
    rm("gemini-3.1-flash-lite", 1048576),
    tm("gemma-4-26b-a4b-it", 131072),
    tm("gemma-4-31b-it", 131072),
    rm("gemini-2.5-pro", 1048576),
  ]),
  prov("amazon-bedrock", "apiKey", [
    rm("anthropic.claude-sonnet-4-6", 1000000),
    rm("anthropic.claude-opus-4-8", 1000000),
    tm("amazon.nova-pro-v1:0", 300000),
    tm("amazon.nova-lite-v1:0", 300000),
  ]),
  prov("minimax", "apiKey", [
    rm("MiniMax-M3", 512000),
    rm("MiniMax-M2.7", 204800),
    rm("MiniMax-M2.7-highspeed", 204800),
  ]),
];

test.before(() => hydrateProviderCatalog(SAMPLE_CATALOG));

test("effort levels are derived per model from pi's thinking ladder", () => {
  const FULL = ["low", "medium", "high", "xhigh"];
  for (const id of [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex-spark",
  ]) {
    assert.deepEqual(getEffortLevels("openai", id), FULL, id);
  }
  for (const id of [
    "claude-sonnet-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
  ]) {
    assert.deepEqual(getEffortLevels("anthropic", id), FULL, id);
  }
});

test("effort levels empty for unknown / effort-less models", () => {
  assert.deepEqual(getEffortLevels("unknown-provider", "unknown-model"), []);
  assert.deepEqual(getEffortLevels(null, null), []);
  assert.deepEqual(getEffortLevels("anthropic", "no-such-model"), []);
  assert.deepEqual(getEffortLevels("anthropic", "opus"), []);
  assert.deepEqual(getEffortLevels("anthropic", "sonnet"), []);
});

test("validEffortOrDefault keeps a value the model accepts", () => {
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

test("validEffortOrDefault normalizes a legacy `max` to the top tier", () => {
  assert.equal(
    validEffortOrDefault("anthropic", "claude-sonnet-4-6", "max"),
    "xhigh",
  );
  assert.equal(validEffortOrDefault("openai", "gpt-5.5", "max"), "xhigh");
});

test("validEffortOrDefault clamps a value the model rejects to the default", () => {
  assert.equal(
    validEffortOrDefault("anthropic", "claude-sonnet-4-6", "bogus"),
    "medium",
  );
  assert.equal(validEffortOrDefault("openai", "gpt-5.5", ""), "medium");
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
  for (const id of [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex-spark",
  ]) {
    assert.equal(validModelOrNull("openai", id), id);
  }
  assert.equal(validModelOrNull("openai", "gpt-5.5-codex"), null);
});

test("normalizeLegacyModel maps retired aliases, passes everything else through", () => {
  assert.equal(normalizeLegacyModel("opus"), "claude-opus-4-7");
  assert.equal(normalizeLegacyModel("sonnet"), "claude-sonnet-4-6");
  assert.equal(normalizeLegacyModel("claude-opus-4-8"), "claude-opus-4-8");
  assert.equal(normalizeLegacyModel("gpt-5.5"), "gpt-5.5");
  assert.equal(normalizeLegacyModel(null), null);
  assert.equal(normalizeLegacyModel(undefined), null);
  assert.equal(normalizeLegacyModel("constructor"), "constructor");
  assert.equal(normalizeLegacyModel("__proto__"), "__proto__");
  assert.equal(normalizeLegacyModel("toString"), "toString");
});

test("OpenCode Zen + Go are api-key providers with a dashboard URL", () => {
  for (const id of ["opencode", "opencode-go"]) {
    const p = getProvider(id);
    assert.ok(p, `${id} is in the catalog`);
    assert.equal(p.auth, "apiKey");
    assert.equal(p.apiKeyUrl, "https://opencode.ai/auth");
    assert.ok(p.models.length > 0, `${id} has models`);
    assert.ok(
      p.models.some((m) => m.id === p.defaultModel),
      `${id} default model is in its model list`,
    );
    const VALID_EFFORT = new Set(["low", "medium", "high", "xhigh"]);
    for (const m of p.models) {
      assert.ok(
        typeof m.contextWindow === "number" && m.contextWindow > 0,
        `${id}/${m.id} has a contextWindow`,
      );
      if (m.effortLevels !== undefined) {
        assert.ok(
          m.effortLevels.length > 0,
          `${id}/${m.id} effortLevels non-empty`,
        );
        for (const e of m.effortLevels) {
          assert.ok(
            VALID_EFFORT.has(e),
            `${id}/${m.id} effort "${e}" is valid`,
          );
        }
      }
    }
  }
  assert.ok(
    getProvider("opencode").models.some((m) => m.id.endsWith("-free")),
    "OpenCode Zen offers at least one free trial model",
  );
  assert.notEqual(getProvider("anthropic").auth, "apiKey");
  assert.notEqual(getProvider("openai").auth, "apiKey");
});

test("OpenCode effort levels are derived from pi (reasoning → ladder, else omitted)", () => {
  const effortOf = (prov, id) =>
    getProvider(prov).models.find((m) => m.id === id)?.effortLevels;
  const FULL = ["low", "medium", "high", "xhigh"];
  for (const [prov, id] of [
    ["opencode", "claude-opus-4-8"],
    ["opencode", "gpt-5.5"],
    ["opencode", "gemini-3.5-flash"],
    ["opencode", "deepseek-v4-flash-free"],
    ["opencode-go", "minimax-m3"],
    ["opencode-go", "deepseek-v4-pro"],
  ]) {
    assert.deepEqual(effortOf(prov, id), FULL, `${prov}/${id}`);
  }
  for (const [prov, id] of [
    ["opencode", "mimo-v2.5-free"],
    ["opencode", "nemotron-3-ultra-free"],
    ["opencode-go", "glm-5.1"],
    ["opencode-go", "kimi-k2.6"],
    ["opencode-go", "qwen3.7-max"],
  ]) {
    assert.equal(
      effortOf(prov, id),
      undefined,
      `${prov}/${id} has no effort levels`,
    );
  }
});

test("MiniMax is an active api-key provider backed by pi-ai's global provider", () => {
  const p = getProvider("minimax");
  assert.ok(p, "minimax is in the active catalog");
  assert.equal(p.name, "MiniMax");
  assert.equal(p.auth, "apiKey");
  assert.equal(p.defaultModel, "MiniMax-M3");
  assert.equal(p.apiKeyUrl, "https://platform.minimax.io");
  assert.deepEqual(
    p.models.map((m) => m.id),
    ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
  );
  for (const m of p.models) {
    assert.ok(
      typeof m.contextWindow === "number" && m.contextWindow > 0,
      `${m.id} has a contextWindow`,
    );
    assert.deepEqual(m.effortLevels, ["low", "medium", "high", "xhigh"]);
  }
});

test("EFFORT_ORDER is the full ascending spectrum and a superset of every model's levels", () => {
  assert.deepEqual(EFFORT_ORDER, ["low", "medium", "high", "xhigh"]);
  const order = new Set(EFFORT_ORDER);
  for (const p of PROVIDERS) {
    for (const m of p.models) {
      for (const e of m.effortLevels ?? []) {
        assert.ok(
          order.has(e),
          `${p.id}/${m.id} effort "${e}" is in EFFORT_ORDER`,
        );
      }
      const positions = (m.effortLevels ?? []).map((e) =>
        EFFORT_ORDER.indexOf(e),
      );
      const ascending = positions.every(
        (pos, i) => i === 0 || pos > positions[i - 1],
      );
      assert.ok(
        ascending,
        `${p.id}/${m.id} effortLevels ascend by EFFORT_ORDER`,
      );
    }
  }
});

test("getVisibleProviders shows the whole runnable /v1/catalog set, gating only local", () => {
  const onNewEngineDesktop = getVisibleProviders({
    newEngine: true,
    desktop: true,
  });
  const onNewEngineWeb = getVisibleProviders({ newEngine: true });

  assert.equal(onNewEngineDesktop.length, PROVIDERS.length);
  assert.ok(onNewEngineDesktop.some((p) => p.id === "opencode"));
  assert.ok(onNewEngineDesktop.some((p) => p.id === "opencode-go"));
  assert.ok(onNewEngineDesktop.some((p) => p.id === "minimax"));
  assert.ok(onNewEngineDesktop.some((p) => p.id === "openai-compatible"));

  assert.ok(onNewEngineWeb.some((p) => p.auth === "apiKey"));
  assert.ok(!onNewEngineWeb.some((p) => p.id === "openai-compatible"));
  assert.equal(
    onNewEngineWeb.length,
    PROVIDERS.filter((p) => p.auth !== "openaiCompatible").length,
  );

  assert.ok(!onNewEngineDesktop.some((p) => p.id === "subq"));
});

test("getVisibleProviders no longer gates by capabilities.providers (catalog is the source)", () => {
  const visible = getVisibleProviders({
    newEngine: true,
    desktop: true,
    capabilities: { providers: ["anthropic"], openaiCompatible: false },
  });
  for (const id of ["anthropic", "openai", "openrouter", "minimax", "google"]) {
    assert.ok(
      visible.some((p) => p.id === id),
      `${id} shows despite not being in capabilities.providers`,
    );
  }
  assert.ok(!visible.some((p) => p.id === "openai-compatible"));
});

test("getVisibleProviders shows the local provider whenever the host reports openaiCompatible, desktop or not", () => {
  const hasLocal = (opts) =>
    getVisibleProviders(opts).some((p) => p.id === "openai-compatible");
  const caps = (openaiCompatible) => ({ providers: [], openaiCompatible });

  assert.ok(
    hasLocal({ newEngine: true, desktop: true, capabilities: caps(true) }),
  );
  assert.ok(hasLocal({ newEngine: true, capabilities: caps(true) }));

  assert.ok(
    !hasLocal({ newEngine: true, desktop: true, capabilities: caps(false) }),
  );
  assert.ok(!hasLocal({ newEngine: true, capabilities: caps(false) }));

  assert.ok(hasLocal({ newEngine: true, desktop: true }));
  assert.ok(!hasLocal({ newEngine: true }));

  assert.ok(
    !hasLocal({ newEngine: false, desktop: true, capabilities: caps(true) }),
  );
  assert.ok(!hasLocal({ newEngine: false, capabilities: caps(true) }));
});

test("getConnectProviders merges the two OpenCode gateways into one account card", () => {
  const connect = getConnectProviders({ newEngine: true, desktop: true });
  const opencode = connect.filter(
    (p) => p.id === "opencode" || p.id === "opencode-go",
  );
  assert.equal(opencode.length, 1, "one OpenCode connect card");
  assert.equal(opencode[0].id, "opencode");
  assert.equal(opencode[0].name, "OpenCode");
  assert.equal(opencode[0].auth, "apiKey");
  assert.deepEqual(opencode[0].gatewayIds, ["opencode", "opencode-go"]);
  const visible = getVisibleProviders({ newEngine: true, desktop: true });
  assert.equal(connect.length, visible.length - 1);
  assert.ok(!connect.some((p) => p.id === "opencode-go"));
  for (const id of [
    "anthropic",
    "openai",
    "github-copilot",
    "openrouter",
    "google",
    "minimax",
    "openai-compatible",
  ]) {
    assert.ok(
      connect.some((p) => p.id === id),
      `${id} still present`,
    );
  }
});

test("getConnectProviders covers the full visible set, one card per provider", () => {
  const connect = getConnectProviders({ newEngine: true, desktop: true });
  const visible = getVisibleProviders({ newEngine: true, desktop: true });
  assert.equal(connect.length, visible.length - 1);
  for (const p of visible) {
    if (p.id === "opencode-go") continue;
    assert.ok(
      connect.some((c) => c.id === p.id),
      `${p.id} has a connect card`,
    );
  }
});

test("providerGatewayIds returns the gateway set, or the provider's own id", () => {
  const opencode = getConnectProviders({
    newEngine: true,
    desktop: true,
  }).find((p) => p.id === "opencode");
  assert.deepEqual(providerGatewayIds(opencode), ["opencode", "opencode-go"]);
  assert.deepEqual(providerGatewayIds(getProvider("anthropic")), ["anthropic"]);
});

test("normalized legacy model resolves through validModelOrNull (no Opus->Sonnet downgrade)", () => {
  assert.equal(
    validModelOrNull("anthropic", normalizeLegacyModel("opus")),
    "claude-opus-4-7",
  );
  assert.equal(
    validModelOrNull("anthropic", normalizeLegacyModel("sonnet")),
    "claude-sonnet-4-6",
  );
});

test("hydrateProviderCatalog([]) keeps the seed instead of wiping it", () => {
  const before = PROVIDERS.map((p) => p.id);
  assert.ok(
    before.length > 1,
    "seed/catalog is populated before the empty call",
  );
  hydrateProviderCatalog([]);
  assert.deepEqual(
    PROVIDERS.map((p) => p.id),
    before,
    "empty catalog left the providers intact",
  );
  assert.ok(getProvider("anthropic"));
  assert.ok(getProvider("openai"));
  assert.ok(PROVIDERS.length > 1);
});

test("model contextWindow: an override default wins over pi's raw window", () => {
  assert.deepEqual(getContextWindowConfig("openai", "gpt-5.5"), {
    default: 258_400,
    max: 828_400,
  });
  assert.deepEqual(getContextWindowConfig("openai", "gpt-5.3-codex-spark"), {
    default: 121_600,
    max: 121_600,
  });
  assert.deepEqual(getContextWindowConfig("anthropic", "claude-fable-5"), {
    default: 1_000_000,
    max: 1_000_000,
  });
});

test("model contextWindow: the Anthropic flagships credit-gate 1M behind a 200k default", () => {
  for (const id of ["claude-opus-4-8", "claude-opus-4-7"]) {
    assert.deepEqual(getContextWindowConfig("anthropic", id), {
      default: 200_000,
      max: 1_000_000,
    });
  }
  assert.deepEqual(getContextWindowConfig("google", "gemini-3.5-flash"), {
    default: 1_048_576,
    max: 1_048_576,
  });
});

test("VISIBLE_MODELS curation filters the hydrated catalog per provider", () => {
  assert.deepEqual(
    getProvider("google").models.map((m) => m.id),
    [
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemma-4-26b-a4b-it",
      "gemma-4-31b-it",
    ],
  );
  assert.equal(validModelOrNull("google", "gemini-2.5-pro"), null);
  assert.equal(getProvider("github-copilot").models.length, 7);
  assert.ok(
    getProvider("github-copilot").models.some(
      (m) => m.id === "gemini-3.6-flash",
    ),
  );
});

test("buildProvider dedupes models that fold to one hub key within a provider", () => {
  const M = (id, name) => ({
    id,
    name,
    pricing: { input: 1, output: 2 },
    contextWindow: 200000,
    maxTokens: 8192,
    reasoning: false,
    vision: false,
  });
  hydrateProviderCatalog([
    {
      id: "amazon-bedrock",
      name: "amazon-bedrock",
      auth: "apiKey",
      models: [
        M("us.anthropic.claude-opus-4-8", "Claude Opus 4.8"),
        M("anthropic.claude-opus-4-8", "Claude Opus 4.8"),
        M("eu.anthropic.claude-opus-4-8", "Claude Opus 4.8"),
        M("amazon.nova-pro-v1:0", "Nova Pro"),
        M("amazon.nova-pro-v1:0", "Nova Pro"),
      ],
    },
  ]);
  const bedrock = getProvider("amazon-bedrock");
  const ids = bedrock.models.map((m) => m.id);
  assert.deepEqual(ids, ["anthropic.claude-opus-4-8", "amazon.nova-pro-v1:0"]);
  hydrateProviderCatalog(SAMPLE_CATALOG);
});
