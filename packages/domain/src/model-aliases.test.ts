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
    "claude-fable-5-2",
    "claude-haiku-5-5",
  ]);
  expect(new Set(Object.values(ANTHROPIC_LINEUP))).toEqual(
    VALID_MODELS.anthropic,
  );
});

test("saying 'sonnet' lands on the CURRENT Anthropic default", () => {
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
  for (const id of ["fable", "claude-fable-5", "claude-fable-5-1"])
    expect(anthropicLineupModel(id), id).toBe("claude-fable-5-2");
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
  expect(
    legacyModelAlias("github-copilot", "claude-haiku-4.5"),
  ).toBeUndefined();
});

test("a lineup id resolves to itself", () => {
  for (const id of Object.values(ANTHROPIC_LINEUP))
    expect(anthropicLineupModel(id)).toBe(id);
});

test("an id with no family in the lineup maps nowhere", () => {
  for (const id of ["claude-2.1", "claude-instant-1.2", "gpt-5.5"])
    expect(anthropicLineupModel(id), id).toBeUndefined();
  expect(MODEL_ALIASES.anthropic).toBeUndefined();
});

test("the Claude lineup rule is the anthropic provider's alone", () => {
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
  expect(MODEL_ALIASES["openai-codex"]?.["gpt-5.5"]).toBe("gpt-6.1-sol");
});

test("a Copilot row GitHub retired maps to the successor GitHub names", () => {
  const copilot = MODEL_ALIASES["github-copilot"] ?? {};
  expect(copilot["gpt-5-mini"]).toBe("gpt-6-luna");
  expect(copilot["gpt-5.5"]).toBe("gpt-5.6-terra");
  expect(copilot["kimi-k2.7-code"]).toBeUndefined();
  expect(copilot["gemini-3.6-flash"]).toBe("gemini-3.8-flash");
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
  expect(deepseek["deepseek-v4-flash-vision-exp"]).toBe("deepseek-flash");
  expect(deepseek["deepseek-v4-pro"]).toBeUndefined();
});

test("an open-catalog gateway carries only its renames", () => {
  const opencode = MODEL_ALIASES.opencode ?? {};
  expect(opencode["mimo-v2.5-free"]).toBe("mimo-v2.6-flash-free");
  expect(opencode["claude-sonnet-4"]).toBe("claude-sonnet-4-6");
  expect(opencode["nemotron-3-ultra-free"]).toBe("nemotron-3.5-super-vl-free");
  expect(opencode["deepseek-v4-flash"]).toBeUndefined();
  expect(opencode["glm-5"]).toBeUndefined();
  expect(Object.keys(opencode)).toEqual([
    "mimo-v2.5-free",
    "claude-sonnet-4",
    "nemotron-3-ultra-free",
    "glm-5.1",
    "glm-5.2",
  ]);
  expect(MODEL_ALIASES["opencode-go"]).toEqual({
    "glm-5.1": "glm-5.3",
    "glm-5.2": "glm-5.3",
    "kimi-k2.6": "kimi-k2.7-code",
    "qwen3.7-max": "qwen3.8-max",
    "space-bunny-free": "deepseek-v4.1-flash",
    "space-bunny": "deepseek-v4.1-flash",
    "deepseek-v4-flash": "deepseek-v4.1-flash",
    "deepseek-v4-flash-vision-exp": "deepseek-v4.1-flash",
    "minimax-m2.7": "minimax-m3",
    "grok-4.6": "grok-4.7",
    "minimax-m3.1-flash-free": "minimax-m3.1-flash",
    "gemini-4-argon-contributor": "gemini-4-argon",
  });
});
