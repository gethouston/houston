import { expect, test } from "vitest";
import { VALID_MODELS } from "./provider-model-catalog";
import {
  MODEL_DISPLAY,
  modelDisplayName,
  namedModelList,
  resolveSpokenModel,
} from "./provider-model-display";

/**
 * The spoken half of the identifier ladder. The incident: asked to "use Luna"
 * or "use Sonnet", the assistant sent the PROVIDER only — nothing anywhere
 * turned the name the user says into the id a pin carries — and every mission
 * silently ran the provider's default instead of what was asked for.
 */

test("every displayed id is one the provider can actually run", () => {
  for (const [provider, rows] of Object.entries(MODEL_DISPLAY)) {
    const valid = VALID_MODELS[provider];
    if (!valid) continue;
    for (const id of Object.keys(rows ?? {})) expect(valid.has(id)).toBe(true);
  }
});

test("the codex codenames a user speaks resolve to their ids", () => {
  const cases: Record<string, string> = {
    Astra: "gpt-6-astra",
    astra: "gpt-6-astra",
    Sol: "gpt-5.6-sol",
    Terra: "gpt-5.6-terra",
    Luna: "gpt-5.6-luna",
    "GPT-5.6 Luna": "gpt-5.6-luna",
    Spark: "gpt-5.3-codex-spark",
    "Codex Spark": "gpt-5.3-codex-spark",
    "5.4 mini": "gpt-5.4-mini",
    "gpt-5.4 MINI": "gpt-5.4-mini",
  };
  for (const [spoken, id] of Object.entries(cases)) {
    expect(resolveSpokenModel("openai-codex", spoken)).toEqual({
      id,
      name: modelDisplayName("openai-codex", id),
      ambiguous: false,
    });
  }
});

test("an anthropic display name resolves to the exact id it names", () => {
  const cases: Record<string, string> = {
    "Sonnet 5": "claude-sonnet-5",
    "sonnet 4.6": "claude-sonnet-4-6",
    "Opus 4.6": "claude-opus-4-6",
    "OPUS 4.8": "claude-opus-4-8",
    "Fable 5.1": "claude-fable-5-1",
    Haiku: "claude-haiku-4-5",
  };
  for (const [spoken, id] of Object.entries(cases)) {
    expect(resolveSpokenModel("anthropic", spoken)?.id).toBe(id);
  }
});

test("a bare family name lands on the newest of that family, flagged", () => {
  expect(resolveSpokenModel("anthropic", "Sonnet")).toEqual({
    id: "claude-sonnet-5",
    name: "Sonnet 5",
    ambiguous: true,
  });
  expect(resolveSpokenModel("anthropic", "opus")).toEqual({
    id: "claude-opus-5",
    name: "Opus 5",
    ambiguous: true,
  });
  // Only one Haiku row: nothing to disambiguate, so nothing is flagged.
  expect(resolveSpokenModel("anthropic", "haiku")?.ambiguous).toBe(false);
});

test("a name no row carries resolves to nothing at all", () => {
  expect(resolveSpokenModel("anthropic", "Luna")).toBeNull();
  expect(resolveSpokenModel("openai-codex", "Sonnet")).toBeNull();
  expect(resolveSpokenModel("anthropic", "")).toBeNull();
  expect(resolveSpokenModel("openrouter", "Luna")).toBeNull();
});

test("the listing pairs each id with the name the user would say", () => {
  const text = namedModelList("openai-codex", [
    "gpt-6-astra",
    "gpt-5.6-luna",
    "some/gateway-id",
  ]);
  expect(text).toContain("gpt-6-astra = GPT-6 Astra");
  expect(text).toContain("gpt-5.6-luna = GPT-5.6 Luna");
  // An id with no display name is still listed — bare, never invented.
  expect(text).toContain("some/gateway-id");
  expect(text).not.toContain("some/gateway-id =");
});

test("the listing is capped and counts what it left out", () => {
  const many = Array.from({ length: 30 }, (_, i) => `m-${i}`);
  expect(namedModelList("openrouter", many, 4)).toBe(
    "m-0, m-1, m-2, m-3 (+26 more)",
  );
});

test("a name resolves only among the models the caller actually offers", () => {
  // The provider serves one Opus, and it is not the newest one: "opus" must
  // land on what it CAN run, never on a row this caller does not offer.
  expect(resolveSpokenModel("anthropic", "opus", ["claude-opus-4-8"])).toEqual({
    id: "claude-opus-4-8",
    name: "Opus 4.8",
    ambiguous: false,
  });
  expect(
    resolveSpokenModel("anthropic", "haiku", ["claude-opus-4-8"]),
  ).toBeNull();
});
