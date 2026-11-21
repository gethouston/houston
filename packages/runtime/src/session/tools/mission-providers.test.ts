import type { ProviderOption } from "@houston/domain";
import { expect, test } from "vitest";
import { acceptedValues } from "./assistant-schema-hint";
import {
  missionModelDescription,
  missionProviderDescription,
  missionProviderParam,
} from "./mission-providers";

const OPTIONS: ProviderOption[] = [
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    connected: true,
    models: ["gpt-6.1-sol", "gpt-5.5-codex"],
  },
  { id: "anthropic", name: "Claude (Pro / Max)", connected: false },
  { id: "openrouter", name: "OpenRouter", connected: true },
];

const NAMED: ProviderOption[] = [
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    connected: true,
    models: ["gpt-6-astra", "gpt-5.6-luna", "gpt-5.3-codex-spark"],
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
  expect(missionProviderDescription(OPTIONS)).not.toContain(
    "listAgentProviders",
  );
});

test("the description carries the per-provider model ids the registry knows", () => {
  const text = missionModelDescription(OPTIONS);
  expect(text).toContain(
    "openai-codex: gpt-6.1-sol = GPT-6.1 Sol, gpt-5.5-codex",
  );
  expect(text).not.toContain("openrouter:");
});

test("the description pairs every model id with the name a user says", () => {
  const text = missionModelDescription(NAMED);
  expect(text).toContain("gpt-5.6-luna = GPT-5.6 Luna");
  expect(text).toContain("claude-opus-4-6 = Opus 4.6");
  expect(text).toContain("claude-sonnet-5 = Sonnet 5");
});
