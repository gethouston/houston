import assert from "node:assert/strict";
import test from "node:test";
import {
  COMING_SOON_PROVIDERS,
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

// The catalog is dynamic now: models come from the host's pi-ai catalog. This
// inline sample mirrors the host's `/v1/catalog` shape (pi ids, pi raw windows,
// pi thinking-level ladders) so hydration reproduces the curated catalog the
// picker reads. It carries pi's `openai-codex` (renamed to `openai`) + pi's
// direct `openai` (dropped), and every first-class provider these tests assert.
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
    rm("gemini-3-flash-preview", 128000),
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
    rm("gemini-3-flash-preview", 1048576),
    rm("gemini-3-pro-preview", 1048576),
    rm("gemini-2.5-flash", 1048576),
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

test("effort levels are per model", () => {
  // Codex: has xhigh, no max. Every catalogued GPT model shares this set
  // (verified against Codex's models_cache.json supported_reasoning_levels).
  for (const id of [
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.3-codex-spark",
  ]) {
    assert.deepEqual(
      getEffortLevels("openai", id),
      ["low", "medium", "high", "xhigh"],
      id,
    );
  }
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
  // Full Codex lineup is catalogued (gpt-5.5 + the gpt-5.4 / mini / spark
  // models added in HOU-589); the phantom gpt-5.5-codex never shipped.
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
    // Every model needs a contextWindow so the composer's usage indicator shows
    // a % (not a raw token count / empty ring). The OpenCode gateway serves a
    // fixed window per model.
    const VALID_EFFORT = new Set(["low", "medium", "high", "xhigh", "max"]);
    for (const m of p.models) {
      assert.ok(
        typeof m.contextWindow === "number" && m.contextWindow > 0,
        `${id}/${m.id} has a contextWindow`,
      );
      // effortLevels, where present, must be a non-empty subset of the effort
      // vocabulary — the picker + validEffortOrDefault depend on it.
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
  // OpenCode Zen exposes free trial models so the provider can be tested
  // without spending credits.
  assert.ok(
    getProvider("opencode").models.some((m) => m.id.endsWith("-free")),
    "OpenCode Zen offers at least one free trial model",
  );
  // The OAuth providers are unchanged (no auth field or "oauth").
  assert.notEqual(getProvider("anthropic").auth, "apiKey");
  assert.notEqual(getProvider("openai").auth, "apiKey");
});

test("OpenCode effort levels match models.dev reasoning_options", () => {
  const effortOf = (prov, id) =>
    getProvider(prov).models.find((m) => m.id === id)?.effortLevels;
  // Models with discrete effort (models.dev reasoning_options.effort.values).
  assert.deepEqual(effortOf("opencode", "claude-opus-4-8"), [
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
  assert.deepEqual(effortOf("opencode", "gpt-5.5"), [
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
  assert.deepEqual(effortOf("opencode", "deepseek-v4-flash-free"), [
    "high",
    "max",
  ]);
  assert.deepEqual(effortOf("opencode-go", "deepseek-v4-pro"), ["high", "max"]);
  // Open models expose only a reasoning toggle (no discrete effort) → omitted.
  for (const [prov, id] of [
    ["opencode", "gemini-3.5-flash"],
    ["opencode", "mimo-v2.5-free"],
    ["opencode", "nemotron-3-ultra-free"],
    ["opencode-go", "glm-5.1"],
    ["opencode-go", "kimi-k2.6"],
    ["opencode-go", "minimax-m3"],
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
    assert.deepEqual(m.effortLevels, ["low", "medium", "high"]);
  }
  assert.ok(
    !COMING_SOON_PROVIDERS.some((provider) => provider.id === "minimax"),
    "MiniMax is no longer coming soon",
  );
});

test("EFFORT_ORDER is the full ascending spectrum and a superset of every model's levels", () => {
  // The composer renders the gauge against EFFORT_ORDER (not the model's own
  // levels) so every model shows the SAME number of bars. That only reads right
  // if EFFORT_ORDER is the canonical low->high spectrum...
  assert.deepEqual(EFFORT_ORDER, ["low", "medium", "high", "xhigh", "max"]);
  // ...and a superset of every model's effortLevels, so any active level a model
  // can hold has a position on the shared gauge (else a bar would never fill).
  const order = new Set(EFFORT_ORDER);
  for (const p of PROVIDERS) {
    for (const m of p.models) {
      for (const e of m.effortLevels ?? []) {
        assert.ok(
          order.has(e),
          `${p.id}/${m.id} effort "${e}" is in EFFORT_ORDER`,
        );
      }
      // A model's own levels must stay in ascending EFFORT_ORDER position, so a
      // subset still renders as a left-anchored prefix of the gauge.
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

test("getVisibleProviders shows the whole runnable /v1/catalog set, gating only local + coming-soon", () => {
  const onNewEngineDesktop = getVisibleProviders({
    newEngine: true,
    desktop: true,
  });
  const onNewEngineWeb = getVisibleProviders({ newEngine: true });

  // New engine + desktop, capabilities not yet loaded: desktop shows the local
  // provider optimistically, so every catalog provider is visible.
  assert.equal(onNewEngineDesktop.length, PROVIDERS.length);
  assert.ok(onNewEngineDesktop.some((p) => p.id === "opencode"));
  assert.ok(onNewEngineDesktop.some((p) => p.id === "opencode-go"));
  assert.ok(onNewEngineDesktop.some((p) => p.id === "minimax"));
  assert.ok(onNewEngineDesktop.some((p) => p.id === "openai-compatible"));

  // New engine in the browser (no desktop), capabilities not yet loaded: the
  // api-key gateways show, but the local OpenAI-compatible provider stays hidden
  // until a host explicitly reports the capability, so it never flashes on a
  // capability-less host.
  assert.ok(onNewEngineWeb.some((p) => p.auth === "apiKey"));
  assert.ok(!onNewEngineWeb.some((p) => p.id === "openai-compatible"));
  assert.equal(
    onNewEngineWeb.length,
    PROVIDERS.filter((p) => p.auth !== "openaiCompatible").length,
  );

  // No provider in the runnable set is on the coming-soon list.
  const comingSoon = new Set(COMING_SOON_PROVIDERS.map((p) => p.id));
  assert.ok(!onNewEngineDesktop.some((p) => comingSoon.has(p.id)));
});

test("getVisibleProviders no longer gates by capabilities.providers (catalog is the source)", () => {
  // A narrow capabilities.providers list used to hide everything absent from it,
  // under-showing the picker. /v1/catalog is the single visibility source now, so
  // providers NOT in the list still show — only the openaiCompatible capability
  // still steers the local provider.
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
  // The one honored capability: openaiCompatible false hides the local provider.
  assert.ok(!visible.some((p) => p.id === "openai-compatible"));
});

test("getVisibleProviders shows the local provider whenever the host reports openaiCompatible, desktop or not", () => {
  const hasLocal = (opts) =>
    getVisibleProviders(opts).some((p) => p.id === "openai-compatible");
  const caps = (openaiCompatible) => ({ providers: [], openaiCompatible });

  // Capability true decides on its own — desktop no longer required. Web/hosted
  // now gets the local provider (cloud pods gained the capability).
  assert.ok(
    hasLocal({ newEngine: true, desktop: true, capabilities: caps(true) }),
  );
  assert.ok(hasLocal({ newEngine: true, capabilities: caps(true) }));

  // Capability false hides it even on desktop (host explicitly can't serve it).
  assert.ok(
    !hasLocal({ newEngine: true, desktop: true, capabilities: caps(false) }),
  );
  assert.ok(!hasLocal({ newEngine: true, capabilities: caps(false) }));

  // Capabilities absent: desktop shows optimistically, web/hosted stays hidden.
  assert.ok(hasLocal({ newEngine: true, desktop: true }));
  assert.ok(!hasLocal({ newEngine: true }));

  // Rust engine hides it regardless of a reported capability.
  assert.ok(
    !hasLocal({ newEngine: false, desktop: true, capabilities: caps(true) }),
  );
  assert.ok(!hasLocal({ newEngine: false, capabilities: caps(true) }));
});

test("getConnectProviders merges the two OpenCode gateways into one account card", () => {
  const connect = getConnectProviders({ newEngine: true, desktop: true });
  // Exactly one OpenCode card on the connect surfaces, standing for both
  // gateways — the chat picker keeps them separate via PROVIDERS directly.
  const opencode = connect.filter(
    (p) => p.id === "opencode" || p.id === "opencode-go",
  );
  assert.equal(opencode.length, 1, "one OpenCode connect card");
  assert.equal(opencode[0].id, "opencode");
  assert.equal(opencode[0].name, "OpenCode");
  assert.equal(opencode[0].auth, "apiKey");
  assert.deepEqual(opencode[0].gatewayIds, ["opencode", "opencode-go"]);
  // It collapses two visible providers into one: the connect list is exactly
  // one shorter than the visible list, and opencode-go is no longer its own card.
  const visible = getVisibleProviders({ newEngine: true, desktop: true });
  assert.equal(connect.length, visible.length - 1);
  assert.ok(!connect.some((p) => p.id === "opencode-go"));
  // Every non-OpenCode provider passes through untouched.
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
  // Every visible provider has a connect card (OpenCode's two gateways merge into
  // one, so the connect list is exactly one shorter).
  assert.equal(connect.length, visible.length - 1);
  for (const p of visible) {
    if (p.id === "opencode-go") continue; // folded into the merged OpenCode card
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
  // The merged OpenCode card fans out to both gateways...
  assert.deepEqual(providerGatewayIds(opencode), ["opencode", "opencode-go"]);
  // ...while a normal provider stands for just itself.
  assert.deepEqual(providerGatewayIds(getProvider("anthropic")), ["anthropic"]);
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

test("hydrateProviderCatalog([]) keeps the seed instead of wiping it", () => {
  // An empty catalog (host 404 / egress-locked pod / fake host) must NOT rebuild
  // PROVIDERS down to just the local provider. Snapshot the currently-hydrated
  // set, hydrate empty, and assert it is untouched.
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
  // Real first-class providers survive, not just the local one.
  assert.ok(getProvider("anthropic"));
  assert.ok(getProvider("openai"));
  assert.ok(PROVIDERS.length > 1);
});

test("model contextWindow: an override default wins over pi's raw window", () => {
  // Codex reports a raw 272000 window (SAMPLE_CATALOG), but its `/status` shows
  // the 95%-effective 258400 — the override supplies that as the indicator's
  // starting denominator, while the snap-up ceiling stays the opt-in-1M window.
  assert.deepEqual(getContextWindowConfig("openai", "gpt-5.5"), {
    default: 258_400,
    max: 950_000,
  });
  assert.deepEqual(getContextWindowConfig("openai", "gpt-5.3-codex-spark"), {
    default: 121_600,
    max: 121_600,
  });
  // A model with no contextWindow override falls back to pi's raw window
  // (Opus 4.8 = 1M in the sample), so the fallback path stays exercised.
  assert.deepEqual(getContextWindowConfig("anthropic", "claude-opus-4-8"), {
    default: 1_000_000,
    max: 1_000_000,
  });
});

test("buildProvider dedupes models that fold to one hub key within a provider", () => {
  // pi lists Bedrock's regional Opus variants under one provider: different ids,
  // one display name → one normalizeKey. Two picker rows for it would leave the
  // un-kept one bare (the hub merges them to a single enriched offer). Hydrate a
  // provider with such a collision + an exact-id dup and assert one survivor: the
  // CLEANER id (shortest, then lexical), matching the hub's within-provider offer.
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
        M("anthropic.claude-opus-4-8", "Claude Opus 4.8"), // cleaner id, same key
        M("eu.anthropic.claude-opus-4-8", "Claude Opus 4.8"),
        M("amazon.nova-pro-v1:0", "Nova Pro"),
        M("amazon.nova-pro-v1:0", "Nova Pro"), // exact-id duplicate
      ],
    },
  ]);
  const bedrock = getProvider("amazon-bedrock");
  const ids = bedrock.models.map((m) => m.id);
  // Opus collapses to the cleaner id; Nova's exact dup collapses to one.
  assert.deepEqual(ids, ["anthropic.claude-opus-4-8", "amazon.nova-pro-v1:0"]);
  // Restore the shared sample catalog for any later test.
  hydrateProviderCatalog(SAMPLE_CATALOG);
});
