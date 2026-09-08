import type { ProviderOption } from "@houston/domain";
import { expect, test } from "vitest";
import { acceptedValues } from "./assistant-schema-hint";
import {
  missionModelDescription,
  missionProviderDescription,
  missionProviderParam,
} from "./mission-providers";

/**
 * The mission pin's closed set: what the SCHEMA offers the model and what the
 * DESCRIPTION spells out. Every id and every model name a user can ask for is
 * written down here, so the model picks one instead of inventing it (the
 * `codex` → `openai-codex` incident).
 */

const OPTIONS: ProviderOption[] = [
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    connected: true,
    models: ["gpt-5.5", "gpt-5.5-codex"],
  },
  { id: "anthropic", name: "Claude (Pro / Max)", connected: false },
  { id: "openrouter", name: "OpenRouter", connected: true },
];

/** The live catalog, as the runtime's registry reports it. */
const NAMED: ProviderOption[] = [
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    connected: true,
    models: ["gpt-6-astra", "gpt-5.6-luna", "gpt-5.4-mini"],
  },
  {
    id: "anthropic",
    name: "Claude (Pro / Max)",
    connected: true,
    models: ["claude-opus-4-6", "claude-sonnet-5"],
  },
];

test("the schema's accepted values ARE the connected provider ids", () => {
  const param = missionProviderParam(OPTIONS);
  if (!param) throw new Error("expected a provider param");
  expect(acceptedValues(param)).toEqual(["openai-codex", "openrouter"]);
});

test("a disconnected provider is not offered as a value", () => {
  const param = missionProviderParam(OPTIONS);
  if (!param) throw new Error("expected a provider param");
  expect(acceptedValues(param)).not.toContain("anthropic");
});

test("with nothing connected there is no provider param at all", () => {
  expect(missionProviderParam([])).toBeUndefined();
  expect(
    missionProviderParam([
      { id: "anthropic", name: "Claude (Pro / Max)", connected: false },
    ]),
  ).toBeUndefined();
  // The model must still be told why the choice is missing.
  expect(missionModelDescription([])).toMatch(/no ai provider is connected/i);
});

test("the description pairs every offered id with its display name", () => {
  const text = missionProviderDescription(OPTIONS);
  expect(text).toContain("openai-codex = ChatGPT / Codex (Plus / Pro)");
  expect(text).toContain("openrouter = OpenRouter");
  expect(text).not.toContain("anthropic");
});

test("only the assistant, which can call it, is pointed at the listing op", () => {
  expect(missionProviderDescription(OPTIONS, true)).toContain(
    "listAgentProviders",
  );
  // Every other agent has no way to perform Houston operations; naming one
  // would be another identifier it cannot look up.
  expect(missionProviderDescription(OPTIONS)).not.toContain(
    "listAgentProviders",
  );
});

test("the description carries the per-provider model ids the registry knows", () => {
  const text = missionModelDescription(OPTIONS);
  expect(text).toContain("openai-codex: gpt-5.5, gpt-5.5-codex");
  // An open-catalog provider has no list to state.
  expect(text).not.toContain("openrouter:");
});

test("the description pairs every model id with the name a user says", () => {
  const text = missionModelDescription(NAMED);
  expect(text).toContain("gpt-5.6-luna = GPT-5.6 Luna");
  expect(text).toContain("claude-opus-4-6 = Opus 4.6");
  expect(text).toContain("claude-sonnet-5 = Sonnet 5");
});
