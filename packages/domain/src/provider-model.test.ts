import { expect, test } from "vitest";
import {
  canonicalModelId,
  canonicalProviderId,
  DEFAULT_PROVIDER,
  migrateProviderModel,
} from "./provider-model";
import { DEFAULT_MODEL, VALID_MODELS } from "./provider-model-catalog";

const VALID_PROVIDERS = [
  "anthropic",
  "openai-codex",
  "opencode",
  "opencode-go",
  "openrouter",
  "deepseek",
  "google",
  "amazon-bedrock",
  "minimax",
  "openai-compatible",
];

const PI_MODELS: Record<string, Set<string>> = {
  anthropic: new Set([
    "claude-fable-5-2",
    "claude-haiku-5-5",
    "claude-opus-5-5",
    "claude-sonnet-5-5",
  ]),
  "openai-codex": new Set([
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6-astra",
    "gpt-6-luna",
    "gpt-6.1-terra",
    "gpt-6-sol",
    "gpt-6.1-sol",
    "gpt-6.2-sol",
    "gpt-6.2-astra",
  ]),
  minimax: new Set([
    "MiniMax-M3.1-Flash",
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M3",
  ]),
  deepseek: new Set(["deepseek-flash", "deepseek-v4-pro"]),
};

function assertValid(r: ReturnType<typeof migrateProviderModel>, msg: string) {
  expect(VALID_PROVIDERS, msg).toContain(r.provider);
  const catalog = PI_MODELS[r.provider];
  if (catalog)
    expect(catalog.has(r.model), `${msg}: model ${r.model}`).toBe(true);
}

test("the real legacy desktop inputs map to valid pi ids with no diagnostic", () => {
  const codex = migrateProviderModel("openai", "gpt-5.5");
  expect(codex.provider).toBe("openai-codex");
  expect(codex.model).toBe("gpt-6.1-sol");
  expect(codex.diagnostics).toEqual([]);
  assertValid(codex, "openai/gpt-5.5");

  const claude = migrateProviderModel("anthropic", "claude-opus-4-8");
  expect(claude.provider).toBe("anthropic");
  expect(claude.model).toBe("claude-opus-5-5");
  expect(claude.diagnostics).toEqual([]);
  assertValid(claude, "anthropic/claude-opus-4-8");
});

test("the GPT-5.6 family and GPT-6 Astra are valid Codex — a lagging table dropped them from wire pins (HOU-1103)", () => {
  for (const model of [
    "gpt-5.6-luna",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-6-astra",
  ]) {
    const r = migrateProviderModel("openai", model);
    expect(r.provider).toBe("openai-codex");
    expect(r.model).toBe(model);
    expect(r.diagnostics).toEqual([]);
    assertValid(r, `openai/${model}`);
  }
});

test("bare tier aliases resolve to their family's lineup model", () => {
  const opus = migrateProviderModel("anthropic", "opus");
  expect(opus.model).toBe("claude-opus-5-5");
  expect(opus.diagnostics).toEqual([]);
  assertValid(opus, "anthropic/opus");

  const sonnet = migrateProviderModel("anthropic", "sonnet");
  expect(sonnet.model).toBe(DEFAULT_MODEL.anthropic);
  expect(sonnet.diagnostics).toEqual([]);
  assertValid(sonnet, "anthropic/sonnet");

  const fable = migrateProviderModel("anthropic", "fable");
  expect(fable.model).toBe("claude-fable-5-2");
  expect(fable.diagnostics).toEqual([]);
  assertValid(fable, "anthropic/fable");
});

test("every retired Claude id stays in its own family", () => {
  const cases: Record<string, string> = {
    "claude-opus-5": "claude-opus-5-5",
    "claude-opus-4-8": "claude-opus-5-5",
    "claude-opus-4-7": "claude-opus-5-5",
    "claude-opus-4-6": "claude-opus-5-5",
    "claude-opus-4-5-20251101": "claude-opus-5-5",
    "claude-3-opus-20240229": "claude-opus-5-5",
    "claude-opus-latest": "claude-opus-5-5",
    "claude-sonnet-5": "claude-sonnet-5-5",
    "claude-sonnet-4-6": "claude-sonnet-5-5",
    "claude-sonnet-4-5-20250929": "claude-sonnet-5-5",
    "claude-3-7-sonnet-20250219": "claude-sonnet-5-5",
    "claude-fable-5": "claude-fable-5-2",
    "claude-fable-5-1": "claude-fable-5-2",
    fable: "claude-fable-5-2",
  };
  for (const [stored, lineup] of Object.entries(cases)) {
    const r = migrateProviderModel("anthropic", stored);
    expect(r.model, stored).toBe(lineup);
    expect(r.diagnostics, stored).toEqual([]);
    assertValid(r, `anthropic/${stored}`);
  }
});

test("a Haiku id runs on Haiku 5.5, within its own family", () => {
  for (const stored of [
    "haiku",
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001",
  ]) {
    const r = migrateProviderModel("anthropic", stored);
    expect(r.model, stored).toBe("claude-haiku-5-5");
    expect(r.diagnostics, stored).toEqual([]);
    assertValid(r, `anthropic/${stored}`);
  }
});

test("an id with no Claude family falls to the default, said out loud", () => {
  const r = migrateProviderModel("anthropic", "claude-2.1");
  expect(r.model).toBe(DEFAULT_MODEL.anthropic);
  expect(r.diagnostics).toHaveLength(1);
  assertValid(r, "anthropic/claude-2.1");
});

test("CLI-era codex model ids map to the closest current tier", () => {
  const full = migrateProviderModel("openai", "gpt-5");
  expect(full.provider).toBe("openai-codex");
  expect(full.model).toBe("gpt-6-astra");
  expect(full.diagnostics).toEqual([]);
  assertValid(full, "openai/gpt-5");

  const mini = migrateProviderModel("codex", "gpt-5-mini");
  expect(mini.provider).toBe("openai-codex");
  expect(mini.model).toBe("gpt-6-luna");
  expect(mini.diagnostics).toEqual([]);
  assertValid(mini, "codex/gpt-5-mini");

  const dropped = migrateProviderModel("openai-codex", "gpt-5.4-mini");
  expect(dropped.model).toBe("gpt-6-luna");
  expect(dropped.diagnostics).toEqual([]);
  assertValid(dropped, "openai-codex/gpt-5.4-mini");
});

test("an already-valid pi provider+model passes through unchanged", () => {
  const r = migrateProviderModel("openai-codex", "gpt-5.6-sol");
  expect(r).toMatchObject({ provider: "openai-codex", model: "gpt-5.6-sol" });
  expect(r.diagnostics).toEqual([]);
  assertValid(r, "passthrough");
});

test("an unknown model id falls soft to the provider default WITH a diagnostic", () => {
  const r = migrateProviderModel("anthropic", "totally-made-up-9000");
  expect(r.provider).toBe("anthropic");
  expect(r.model).toBe(DEFAULT_MODEL.anthropic);
  expect(r.diagnostics).toHaveLength(1);
  expect(r.diagnostics[0]?.message).toContain("totally-made-up-9000");
  assertValid(r, "unknown anthropic model");
});

test("a genuinely new pi-ai provider id passes through UNCHANGED (not → Codex)", () => {
  const groq = migrateProviderModel("groq", "llama-3.3-70b");
  expect(groq.provider).toBe("groq");
  expect(groq.model).toBe("llama-3.3-70b");
  expect(groq.diagnostics).toEqual([]);

  const mistral = migrateProviderModel("mistral", "mistral-large-latest");
  expect(mistral.provider).toBe("mistral");
  expect(mistral.model).toBe("mistral-large-latest");
  expect(mistral.diagnostics).toEqual([]);
});

test("a stored id naming an Object prototype member is a table MISS, not an entry", () => {
  expect(canonicalProviderId("constructor")).toBe("constructor");
  expect(canonicalProviderId("toString")).toBe("toString");
  expect(canonicalModelId("opencode", "constructor")).toBe("constructor");
  expect(canonicalModelId("anthropic", "toString")).toBe(null);
  const r = migrateProviderModel("constructor", "toString");
  expect(r).toMatchObject({ provider: "constructor", model: "toString" });
  expect(typeof r.provider).toBe("string");
  expect(migrateProviderModel("toString", undefined).model).toBe("");
});

test("missing provider/model fall soft to the defaults with provider diagnostic", () => {
  const r = migrateProviderModel(undefined, undefined);
  expect(r.provider).toBe(DEFAULT_PROVIDER);
  expect(r.model).toBe(DEFAULT_MODEL[DEFAULT_PROVIDER]);
  expect(r.diagnostics.some((d) => d.message.includes("provider"))).toBe(true);
  expect(r.diagnostics.some((d) => d.message.includes("model"))).toBe(true);
  assertValid(r, "all missing");
});

test("api-key gateway models pass through (open catalog, no throw on getModel)", () => {
  const r = migrateProviderModel("opencode-go", "deepseek-v4-pro");
  expect(r).toMatchObject({
    provider: "opencode-go",
    model: "deepseek-v4-pro",
  });
  expect(r.diagnostics).toEqual([]);
});

test("an open-catalog gateway's curated rename is applied, with no diagnostic", () => {
  const r = migrateProviderModel("opencode", "mimo-v2.5-free");
  expect(r).toMatchObject({
    provider: "opencode",
    model: "mimo-v2.6-flash-free",
  });
  expect(r.diagnostics).toEqual([]);
});

test("an OpenCode Go row pi 0.99.1 dropped maps to its same-tier successor", () => {
  for (const [stale, successor] of [
    ["glm-5.1", "glm-5.3"],
    ["kimi-k2.6", "kimi-k2.7-code"],
    ["qwen3.7-max", "qwen3.8-max"],
  ] as const) {
    const r = migrateProviderModel("opencode-go", stale);
    expect(r, stale).toMatchObject({
      provider: "opencode-go",
      model: successor,
    });
    expect(r.diagnostics, stale).toEqual([]);
  }
});

test("a deepseek id the catalog renamed maps at the same tier", () => {
  for (const stale of ["deepseek-v4-flash", "deepseek-v4-flash-vision-exp"]) {
    const r = migrateProviderModel("deepseek", stale);
    expect(r.provider, stale).toBe("deepseek");
    expect(r.model, stale).toBe("deepseek-flash");
    expect(r.diagnostics, stale).toEqual([]);
    assertValid(r, `deepseek/${stale}`);
  }
  expect(migrateProviderModel("deepseek", "deepseek-v4-pro").model).toBe(
    "deepseek-v4-pro",
  );
});

test("MiniMax global provider uses the pi-ai catalog, not minimax-cn", () => {
  const r = migrateProviderModel("minimax", "MiniMax-M3");
  expect(r).toMatchObject({ provider: "minimax", model: "MiniMax-M3" });
  expect(r.diagnostics).toEqual([]);
  assertValid(r, "minimax/MiniMax-M3");

  const fallback = migrateProviderModel("minimax", "MiniMax-M1");
  expect(fallback.provider).toBe("minimax");
  expect(fallback.model).toBe("MiniMax-M3.1-Flash");
  expect(fallback.diagnostics[0]?.message).toContain("MiniMax-M1");
  assertValid(fallback, "minimax fallback");
});

test("a saved retired MiniMax id migrates to the MiniMax default", () => {
  for (const retired of [
    "MiniMax-M3[1m]",
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
  ]) {
    const r = migrateProviderModel("minimax", retired);
    expect(r).toMatchObject({
      provider: "minimax",
      model: "MiniMax-M3.1-Flash",
    });
    expect(r.diagnostics[0]?.message).toContain(retired);
    assertValid(r, `minimax/${retired}`);
  }
});

test("deepseek provider models migrate against its finite pi catalog", () => {
  const valid = migrateProviderModel("deepseek", "deepseek-v4-pro");
  expect(valid).toMatchObject({
    provider: "deepseek",
    model: "deepseek-v4-pro",
  });
  expect(valid.diagnostics).toEqual([]);
  assertValid(valid, "deepseek valid model");

  const stale = migrateProviderModel("deepseek", "deepseek-coder-old");
  expect(stale).toMatchObject({
    provider: "deepseek",
    model: "deepseek-flash",
  });
  expect(stale.diagnostics[0]?.message).toContain("deepseek-coder-old");
  assertValid(stale, "deepseek stale model");
});

test("the diagnostic key defaults to the config doc path and is overridable", () => {
  expect(
    migrateProviderModel("anthropic", "totally-made-up").diagnostics[0]?.key,
  ).toBe(".houston/config/config.json");
  expect(
    migrateProviderModel("anthropic", "totally-made-up", "Work/Sales")
      .diagnostics[0]?.key,
  ).toBe("Work/Sales");
});

test("a stored Codex model the subscription no longer serves migrates to one it does", () => {
  for (const stale of ["gpt-5.4", "gpt-5.5-codex"]) {
    const r = migrateProviderModel("openai-codex", stale);
    expect(r.model, stale).toBe("gpt-6-astra");
    expect(r.diagnostics, stale).toEqual([]);
    assertValid(r, `openai-codex/${stale}`);
  }
  const spark = migrateProviderModel("openai-codex", "gpt-5.3-codex-spark");
  expect(spark.model).toBe("gpt-6-luna");
  expect(spark.diagnostics).toEqual([]);
  assertValid(spark, "openai-codex/gpt-5.3-codex-spark");
  expect(DEFAULT_MODEL["openai-codex"]).toBe("gpt-6-luna");
  expect(VALID_MODELS["openai-codex"]?.has("gpt-6-luna")).toBe(true);
  for (const gone of ["gpt-5.3-codex-spark", "gpt-5.4"])
    expect(VALID_MODELS["openai-codex"]?.has(gone), gone).toBe(false);
});

test("a provider with no catalog default never inherits another provider's model", () => {
  expect(DEFAULT_MODEL.groq).toBeUndefined();
  for (const provider of ["groq", "cerebras", "together", "xai", "fireworks"]) {
    const r = migrateProviderModel(provider, undefined);
    expect(r.provider, provider).toBe(provider);
    expect(r.model, provider).toBe("");
    expect(r.model, provider).not.toBe(DEFAULT_MODEL[DEFAULT_PROVIDER]);
    expect(r.model, provider).not.toBe(DEFAULT_MODEL.anthropic);
  }
});

test("an absent model that GAINS the provider's default says so", () => {
  const r = migrateProviderModel("anthropic", undefined);
  expect(r.model).toBe(DEFAULT_MODEL.anthropic);
  expect(r.diagnostics).toHaveLength(1);
  expect(r.diagnostics[0]?.message).toContain(String(DEFAULT_MODEL.anthropic));
});

test("a Mistral config with no model gains Mistral Large 4, not pi's first row", () => {
  const r = migrateProviderModel("mistral", undefined);
  expect(r.provider).toBe("mistral");
  expect(r.model).toBe("mistral-large-4");
  expect(r.diagnostics).toHaveLength(1);
});

test("nothing is gained, so nothing is reported, when the provider has no default", () => {
  expect(migrateProviderModel("groq", undefined).diagnostics).toEqual([]);
});

test("a provider with no catalog default is ABSENT, never an empty string", () => {
  expect(DEFAULT_MODEL["openai-compatible"]).toBeUndefined();
  expect("openai-compatible" in DEFAULT_MODEL).toBe(false);
  expect(DEFAULT_MODEL["openai-compatible"] ?? "first-served-model").toBe(
    "first-served-model",
  );
  expect(migrateProviderModel("openai-compatible", undefined).model).toBe("");
});
