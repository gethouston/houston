import type { ProviderOption } from "@houston/domain";
import { expect, test } from "vitest";
import { acceptedValues } from "./assistant-schema-hint";
import {
  missionModelDescription,
  missionProviderDescription,
  missionProviderParam,
  missionRunsOn,
  resolveMissionPin,
} from "./mission-providers";

/**
 * The mission pin's closed set: what the SCHEMA offers the model, what the
 * DESCRIPTION spells out, and what a written value resolves to. A provider id
 * is never something the model has to invent (the `codex` → `openai-codex`
 * incident).
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

test("a written provider resolves to its id, alias or display name alike", () => {
  expect(resolveMissionPin({ provider: "Codex" }, OPTIONS)).toEqual({
    provider: "openai-codex",
  });
  expect(
    resolveMissionPin({ provider: "OpenRouter", model: "any/thing" }, OPTIONS),
  ).toEqual({ provider: "openrouter", model: "any/thing" });
});

test("an unknown provider throws the list of ids and names", () => {
  expect(() => resolveMissionPin({ provider: "gemini-cli" }, OPTIONS)).toThrow(
    /openai-codex \(ChatGPT \/ Codex \(Plus \/ Pro\)\)/,
  );
});

test("a disconnected provider throws a refusal naming it", () => {
  expect(() => resolveMissionPin({ provider: "claude" }, OPTIONS)).toThrow(
    /anthropic .*not connected/i,
  );
});

test("a model is validated against the provider the same call pins", () => {
  expect(() =>
    resolveMissionPin({ provider: "codex", model: "gpt5" }, OPTIONS),
  ).toThrow(/gpt-5.5-codex/);
  expect(
    resolveMissionPin({ provider: "codex", model: "gpt-5.5" }, OPTIONS),
  ).toEqual({ provider: "openai-codex", model: "gpt-5.5" });
});

test("a model named alone is validated against the inherited provider", () => {
  expect(() =>
    resolveMissionPin({ model: "gpt5" }, OPTIONS, "openai-codex"),
  ).toThrow(/gpt-5.5/);
  expect(
    resolveMissionPin({ model: "gpt-5.5" }, OPTIONS, "openai-codex"),
  ).toEqual({ model: "gpt-5.5" });
  // Nothing to validate against: the model rides through and the provider's own
  // error is what surfaces.
  expect(resolveMissionPin({ model: "whatever" }, OPTIONS)).toEqual({
    model: "whatever",
  });
});

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

test("the description pairs every model id with the name a user says", () => {
  const text = missionModelDescription(NAMED);
  expect(text).toContain("gpt-5.6-luna = GPT-5.6 Luna");
  expect(text).toContain("claude-opus-4-6 = Opus 4.6");
  expect(text).toContain("claude-sonnet-5 = Sonnet 5");
});

test("the name the user said pins the model, never the provider default", () => {
  expect(
    resolveMissionPin({ provider: "codex", model: "Luna" }, NAMED),
  ).toEqual({ provider: "openai-codex", model: "gpt-5.6-luna" });
  expect(
    resolveMissionPin({ provider: "anthropic", model: "Opus 4.6" }, NAMED),
  ).toEqual({ provider: "anthropic", model: "claude-opus-4-6" });
  // A name alone rides the provider the mission inherits.
  expect(
    resolveMissionPin({ model: "5.4 mini" }, NAMED, "openai-codex"),
  ).toEqual({ model: "gpt-5.4-mini" });
});

test("what the tool tells the user names the model it really pinned", () => {
  const text = missionRunsOn(
    { provider: "anthropic", model: "claude-sonnet-5" },
    NAMED,
  );
  expect(text).toContain("claude-sonnet-5 (Sonnet 5)");
  expect(text).toContain("anthropic (Claude (Pro / Max))");
});
