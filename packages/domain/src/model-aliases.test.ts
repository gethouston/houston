import { expect, test } from "vitest";
import {
  ANTHROPIC_LINEUP,
  anthropicLineupModel,
  legacyModelAlias,
  MODEL_ALIASES,
} from "./model-aliases";
import { DEFAULT_MODEL } from "./provider-default-models";
import { VALID_MODELS } from "./provider-valid-models";

test("the Claude lineup is exactly what the anthropic provider runs", () => {
  expect(Object.values(ANTHROPIC_LINEUP)).toEqual([
    "claude-sonnet-5-5",
    "claude-opus-5-5",
    "claude-fable-5-1",
    "claude-haiku-5-5",
  ]);
  expect(new Set(Object.values(ANTHROPIC_LINEUP))).toEqual(
    VALID_MODELS.anthropic,
  );
});

test("saying 'sonnet' lands on the CURRENT Anthropic default", () => {
  // The same user, saying "sonnet" and saying nothing, must get one model.
  expect(legacyModelAlias("anthropic", "sonnet")).toBe(DEFAULT_MODEL.anthropic);
  expect(legacyModelAlias("anthropic", "claude-sonnet-latest")).toBe(
    DEFAULT_MODEL.anthropic,
  );
});

test("an Opus id always lands on Opus, never on Sonnet", () => {
  for (const id of [
    "opus",
    "claude-opus-latest",
    "claude-opus-5",
    "claude-opus-4-8",
    "claude-opus-4-8[1m]",
    "claude-opus-4-1-20250805",
    "claude-3-opus-20240229",
  ])
    expect(anthropicLineupModel(id), id).toBe("claude-opus-5-5");
});

test("Sonnet and Fable ids land in their own family", () => {
  for (const id of [
    "sonnet",
    "claude-sonnet-5",
    "claude-sonnet-4-6",
    "claude-sonnet-4-5-20250929",
    "claude-3-5-sonnet-20241022",
  ])
    expect(anthropicLineupModel(id), id).toBe("claude-sonnet-5-5");
  for (const id of ["fable", "claude-fable-5"])
    expect(anthropicLineupModel(id), id).toBe("claude-fable-5-1");
});

test("a Haiku id lands on Haiku 5.5, never up a tier", () => {
  for (const id of [
    "haiku",
    "claude-haiku-latest",
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001",
    "claude-3-5-haiku-20241022",
  ])
    expect(anthropicLineupModel(id), id).toBe("claude-haiku-5-5");
  expect(legacyModelAlias("anthropic", "claude-haiku-4-5")).toBe(
    "claude-haiku-5-5",
  );
  // Copilot's dotted Haiku row is Copilot's own, untouched.
  expect(
    legacyModelAlias("github-copilot", "claude-haiku-4.5"),
  ).toBeUndefined();
});

test("a lineup id resolves to itself", () => {
  for (const id of Object.values(ANTHROPIC_LINEUP))
    expect(anthropicLineupModel(id)).toBe(id);
});

test("an id with no family in the lineup maps nowhere", () => {
  // Not re-tiered into another family; the caller's ladder decides.
  for (const id of ["claude-2.1", "claude-instant-1.2", "gpt-5.5"])
    expect(anthropicLineupModel(id), id).toBeUndefined();
  expect(MODEL_ALIASES.anthropic).toBeUndefined();
});

test("the Claude lineup rule is the anthropic provider's alone", () => {
  // A gateway's `claude-opus-4-8` is that gateway's own row, not a retired
  // Anthropic subscription id.
  expect(legacyModelAlias("opencode", "claude-opus-4-8")).toBeUndefined();
  expect(legacyModelAlias("github-copilot", "claude-sonnet-5")).toBeUndefined();
  expect(legacyModelAlias(null, "opus")).toBeUndefined();
  expect(legacyModelAlias("anthropic", "constructor")).toBeUndefined();
});

test("legacy dated/retired ids stay pinned at their tier (never an auto-upgrade)", () => {
  const codex = MODEL_ALIASES["openai-codex"] ?? {};
  expect(codex["gpt-5.4"]).toBe("gpt-6-astra");
  expect(codex["gpt-5-mini"]).toBe("gpt-6-luna");
  expect(codex["gpt-5.1-mini"]).toBe("gpt-6-luna");
  expect(codex["gpt-5.4-mini"]).toBe("gpt-6-luna");
});

test("a refused gpt-5.5 pin lands on the latest Sol, not on gpt-6-astra", () => {
  // The subscription refuses gpt-5.5 since 2026-10-22. gpt-6-astra would spend
  // the allowance far faster than the model the user chose; Sol costs less.
  expect(MODEL_ALIASES["openai-codex"]?.["gpt-5.5"]).toBe("gpt-6.1-sol");
});

test("a Copilot row GitHub retired maps to the successor GitHub names", () => {
  const copilot = MODEL_ALIASES["github-copilot"] ?? {};
  expect(copilot["gpt-5-mini"]).toBe("gpt-6-luna");
  expect(copilot["gpt-5.5"]).toBe("gpt-6.1-sol");
  expect(copilot["gemini-3.6-flash"]).toBe("gemini-3.8-flash");
  // A row Copilot still serves is never renamed.
  expect(copilot["claude-haiku-4.5"]).toBeUndefined();
});

test("a dropped MiMo V2.5 pin lands on a V2.6 row that costs no more", () => {
  expect(MODEL_ALIASES.xiaomi).toEqual({
    "mimo-v2.5": "mimo-v2.6-flash",
    "mimo-v2.5-pro": "mimo-v2.6-pro",
    "mimo-v2.5-pro-ultraspeed": "mimo-v2.6-pro",
  });
});

test("a renamed deepseek row maps to the id that replaced it", () => {
  const deepseek = MODEL_ALIASES.deepseek ?? {};
  expect(deepseek["deepseek-v4-flash"]).toBe("deepseek-flash");
  // The vision variant folded into the same row: `deepseek-flash` takes
  // text+image, so the capability the id was chosen for survives the map.
  expect(deepseek["deepseek-v4-flash-vision-exp"]).toBe("deepseek-flash");
  // The Pro tier is untouched — it is still its own row.
  expect(deepseek["deepseek-v4-pro"]).toBeUndefined();
});

test("an open-catalog gateway carries only its renames", () => {
  const opencode = MODEL_ALIASES.opencode ?? {};
  expect(opencode["mimo-v2.5-free"]).toBe("mimo-v2.6-flash-free");
  // Nothing else: a gateway id with no successor must keep passing through, so
  // the picker's live list — not this table — decides what it can move to.
  expect(Object.keys(opencode)).toEqual(["mimo-v2.5-free"]);
  // Each OpenCode Go row is a model pi dropped, mapped to its successor.
  expect(MODEL_ALIASES["opencode-go"]).toEqual({
    "glm-5.1": "glm-5.2",
    "kimi-k2.6": "kimi-k2.7-code",
    "qwen3.7-max": "qwen3.8-max",
    "space-bunny-free": "deepseek-v4.1-flash",
    "space-bunny": "deepseek-v4.1-flash",
    "deepseek-v4-flash": "deepseek-v4.1-flash",
    "deepseek-v4-flash-vision-exp": "deepseek-v4.1-flash",
    "minimax-m2.7": "minimax-m3",
    "grok-4.6": "grok-4.7",
  });
});
