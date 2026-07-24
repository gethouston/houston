import { expect, test } from "vitest";
import { DEFAULT_PROVIDER, migrateProviderModel } from "./provider-model";

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

// pi's OAuth-provider catalogs (the ones getModel throws on for an unknown id),
// mirrored here so the tests assert the OUTPUT is a model pi actually offers —
// independent of the table the implementation happens to use.
const PI_MODELS: Record<string, Set<string>> = {
  anthropic: new Set([
    "claude-3-5-haiku-20241022",
    "claude-3-5-haiku-latest",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-sonnet-20241022",
    "claude-3-7-sonnet-20250219",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001",
    "claude-opus-4-0",
    "claude-opus-4-1",
    "claude-opus-4-1-20250805",
    "claude-opus-4-20250514",
    "claude-opus-4-5",
    "claude-opus-4-5-20251101",
    "claude-opus-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
    "claude-opus-5",
    "claude-sonnet-4-0",
    "claude-sonnet-4-20250514",
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-6",
    "claude-sonnet-5",
  ]),
  "openai-codex": new Set([
    "gpt-5.3-codex-spark",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.5",
  ]),
  minimax: new Set(["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M3"]),
  deepseek: new Set(["deepseek-v4-flash", "deepseek-v4-pro"]),
};

/** Every migration result must name a real provider, and (for the OAuth
 * providers) a model pi actually offers. */
function assertValid(r: ReturnType<typeof migrateProviderModel>, msg: string) {
  expect(VALID_PROVIDERS, msg).toContain(r.provider);
  const catalog = PI_MODELS[r.provider];
  if (catalog)
    expect(catalog.has(r.model), `${msg}: model ${r.model}`).toBe(true);
}

test("the real legacy desktop inputs map to valid pi ids with no diagnostic", () => {
  // From the user's actual ~/.houston data: {"provider":"openai","model":"gpt-5.5"}.
  const codex = migrateProviderModel("openai", "gpt-5.5");
  expect(codex.provider).toBe("openai-codex");
  expect(codex.model).toBe("gpt-5.5");
  expect(codex.diagnostics).toEqual([]);
  assertValid(codex, "openai/gpt-5.5");

  // {"provider":"anthropic","model":"claude-opus-4-8"} — both already valid.
  const claude = migrateProviderModel("anthropic", "claude-opus-4-8");
  expect(claude.provider).toBe("anthropic");
  expect(claude.model).toBe("claude-opus-4-8");
  expect(claude.diagnostics).toEqual([]);
  assertValid(claude, "anthropic/claude-opus-4-8");
});

test("bare tier aliases resolve to the pi id at the SAME tier (no upgrade)", () => {
  const opus = migrateProviderModel("anthropic", "opus");
  expect(opus.model).toBe("claude-opus-5");
  expect(opus.diagnostics).toEqual([]);
  assertValid(opus, "anthropic/opus");

  const sonnet = migrateProviderModel("anthropic", "sonnet");
  expect(sonnet.model).toBe("claude-sonnet-4-6");
  expect(sonnet.diagnostics).toEqual([]);
  assertValid(sonnet, "anthropic/sonnet");

  const haiku = migrateProviderModel("anthropic", "haiku");
  expect(haiku.model).toBe("claude-haiku-4-5");
  expect(haiku.diagnostics).toEqual([]);
  assertValid(haiku, "anthropic/haiku");
});

test("CLI-era codex model ids map to the closest current tier", () => {
  const full = migrateProviderModel("openai", "gpt-5");
  expect(full.provider).toBe("openai-codex");
  expect(full.model).toBe("gpt-5.5");
  expect(full.diagnostics).toEqual([]);
  assertValid(full, "openai/gpt-5");

  const mini = migrateProviderModel("codex", "gpt-5-mini");
  expect(mini.provider).toBe("openai-codex");
  expect(mini.model).toBe("gpt-5.4-mini");
  expect(mini.diagnostics).toEqual([]);
  assertValid(mini, "codex/gpt-5-mini");
});

test("an already-valid pi provider+model passes through unchanged", () => {
  const r = migrateProviderModel("openai-codex", "gpt-5.4");
  expect(r).toMatchObject({ provider: "openai-codex", model: "gpt-5.4" });
  expect(r.diagnostics).toEqual([]);
  assertValid(r, "passthrough");
});

test("an unknown model id falls soft to the provider default WITH a diagnostic", () => {
  const r = migrateProviderModel("anthropic", "totally-made-up-9000");
  expect(r.provider).toBe("anthropic");
  expect(r.model).toBe("claude-sonnet-4-6"); // anthropic default
  expect(r.diagnostics).toHaveLength(1);
  expect(r.diagnostics[0]?.message).toContain("totally-made-up-9000");
  assertValid(r, "unknown anthropic model");
});

test("a genuinely new pi-ai provider id passes through UNCHANGED (not → Codex)", () => {
  // The pi-ai catalog is open (~35 providers, and it drifts). A provider id we
  // don't enumerate ("groq", "mistral") is a REAL provider, not a legacy typo —
  // it must pass through verbatim, never get silently rewritten to the cloud
  // default. Its model (open catalog for an unknown provider) passes through
  // too, with no diagnostic. This is the "unknown → Codex" trap we removed.
  const groq = migrateProviderModel("groq", "llama-3.3-70b");
  expect(groq.provider).toBe("groq");
  expect(groq.model).toBe("llama-3.3-70b");
  expect(groq.diagnostics).toEqual([]);

  const mistral = migrateProviderModel("mistral", "mistral-large-latest");
  expect(mistral.provider).toBe("mistral");
  expect(mistral.model).toBe("mistral-large-latest");
  expect(mistral.diagnostics).toEqual([]);
});

test("missing provider/model fall soft to the defaults with provider diagnostic", () => {
  const r = migrateProviderModel(undefined, undefined);
  expect(r.provider).toBe(DEFAULT_PROVIDER);
  expect(r.model).toBe("gpt-5.5");
  // Missing provider is reported; a missing model on a defaulted provider just
  // uses the default (no extra noise needed once the provider is known).
  expect(r.diagnostics.some((d) => d.message.includes("provider"))).toBe(true);
  assertValid(r, "all missing");
});

test("api-key gateway models pass through (open catalog, no throw on getModel)", () => {
  // opencode / opencode-go forward arbitrary model ids to the gateway, so a
  // model pi doesn't enumerate must NOT be rewritten or diagnosed.
  const r = migrateProviderModel("opencode-go", "deepseek-v4-pro");
  expect(r).toMatchObject({
    provider: "opencode-go",
    model: "deepseek-v4-pro",
  });
  expect(r.diagnostics).toEqual([]);
});

test("MiniMax global provider uses the pi-ai catalog, not minimax-cn", () => {
  const r = migrateProviderModel("minimax", "MiniMax-M2.7");
  expect(r).toMatchObject({ provider: "minimax", model: "MiniMax-M2.7" });
  expect(r.diagnostics).toEqual([]);
  assertValid(r, "minimax/MiniMax-M2.7");

  const fallback = migrateProviderModel("minimax", "MiniMax-M1");
  expect(fallback.provider).toBe("minimax");
  expect(fallback.model).toBe("MiniMax-M3");
  expect(fallback.diagnostics[0]?.message).toContain("MiniMax-M1");
  assertValid(fallback, "minimax fallback");
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
    model: "deepseek-v4-flash",
  });
  expect(stale.diagnostics[0]?.message).toContain("deepseek-coder-old");
  assertValid(stale, "deepseek stale model");
});

test("the diagnostic key defaults to the config doc path and is overridable", () => {
  // Any input that produces a diagnostic (here: an unknown anthropic model on a
  // finite-catalog provider) — the key names the source doc.
  expect(
    migrateProviderModel("anthropic", "totally-made-up").diagnostics[0]?.key,
  ).toBe(".houston/config/config.json");
  expect(
    migrateProviderModel("anthropic", "totally-made-up", "Work/Sales")
      .diagnostics[0]?.key,
  ).toBe("Work/Sales");
});
