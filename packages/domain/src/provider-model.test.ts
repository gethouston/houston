import { expect, test } from "bun:test";
import { DEFAULT_PROVIDER, migrateProviderModel } from "./provider-model";

const VALID_PROVIDERS = [
  "anthropic",
  "openai-codex",
  "opencode",
  "opencode-go",
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
    "claude-sonnet-4-0",
    "claude-sonnet-4-20250514",
    "claude-sonnet-4-5",
    "claude-sonnet-4-5-20250929",
    "claude-sonnet-4-6",
  ]),
  "openai-codex": new Set([
    "gpt-5.3-codex-spark",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.5",
  ]),
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
  expect(opus.model).toBe("claude-opus-4-8");
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

test("an unknown provider falls soft to the default provider WITH a diagnostic", () => {
  // Gemini was dropped — a stored gemini agent must not throw, it must land on
  // the default provider with a recorded diagnostic.
  const r = migrateProviderModel("gemini", "gemini-2.5-pro");
  expect(r.provider).toBe(DEFAULT_PROVIDER);
  // The gemini model can't be a codex model either → also a model diagnostic.
  expect(r.model).toBe("gpt-5.5");
  expect(r.diagnostics.length).toBeGreaterThanOrEqual(1);
  expect(r.diagnostics.some((d) => d.message.includes("gemini"))).toBe(true);
  assertValid(r, "unknown provider");
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

test("the diagnostic key defaults to the config doc path and is overridable", () => {
  expect(migrateProviderModel("gemini", "x").diagnostics[0]?.key).toBe(
    ".houston/config/config.json",
  );
  expect(
    migrateProviderModel("gemini", "x", "Work/Sales").diagnostics[0]?.key,
  ).toBe("Work/Sales");
});
