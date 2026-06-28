import assert from "node:assert/strict";
import test from "node:test";
import {
  COMING_SOON_PROVIDERS,
  EFFORT_ORDER,
  getConnectProviders,
  getEffortLevels,
  getProvider,
  getVisibleProviders,
  normalizeLegacyModel,
  PROVIDERS,
  providerGatewayIds,
  validEffortOrDefault,
  validModelOrNull,
} from "./providers.ts";

test("effort levels are per model", () => {
  // Codex: has xhigh, no max.
  assert.deepEqual(getEffortLevels("openai", "gpt-5.5"), [
    "low",
    "medium",
    "high",
    "xhigh",
  ]);
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
    ["opencode", "minimax-m3-free"],
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

test("getVisibleProviders gates api-key (new engine) and local (desktop) providers", () => {
  const onNewEngineDesktop = getVisibleProviders({
    newEngine: true,
    desktop: true,
  });
  const onNewEngineWeb = getVisibleProviders({ newEngine: true });
  const onRustEngine = getVisibleProviders({ newEngine: false });

  // New engine + desktop: every catalog provider is visible.
  assert.equal(onNewEngineDesktop.length, PROVIDERS.length);
  assert.ok(onNewEngineDesktop.some((p) => p.id === "opencode"));
  assert.ok(onNewEngineDesktop.some((p) => p.id === "opencode-go"));
  assert.ok(onNewEngineDesktop.some((p) => p.id === "minimax"));
  assert.ok(onNewEngineDesktop.some((p) => p.id === "openai-compatible"));

  // New engine in the browser (no desktop): the api-key gateways show, but the
  // local OpenAI-compatible provider is hidden — its base URL is the user's own
  // machine, unreachable from a browser/cloud deployment.
  assert.ok(onNewEngineWeb.some((p) => p.auth === "apiKey"));
  assert.ok(!onNewEngineWeb.some((p) => p.id === "openai-compatible"));
  assert.equal(
    onNewEngineWeb.length,
    PROVIDERS.filter((p) => p.auth !== "openaiCompatible").length,
  );

  // Rust engine: api-key AND local providers are filtered out, OAuth ones stay.
  assert.ok(!onRustEngine.some((p) => p.auth === "apiKey"));
  assert.ok(!onRustEngine.some((p) => p.auth === "openaiCompatible"));
  assert.ok(onRustEngine.some((p) => p.id === "anthropic"));
  assert.ok(onRustEngine.some((p) => p.id === "openai"));
  assert.equal(
    onRustEngine.length,
    PROVIDERS.filter(
      (p) => p.auth !== "apiKey" && p.auth !== "openaiCompatible",
    ).length,
  );
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

test("getConnectProviders hides api-key cards on the Rust engine, like getVisibleProviders", () => {
  const connect = getConnectProviders({ newEngine: false });
  assert.ok(!connect.some((p) => p.id === "opencode"));
  assert.ok(!connect.some((p) => p.auth === "apiKey"));
  assert.ok(connect.some((p) => p.id === "anthropic"));
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
