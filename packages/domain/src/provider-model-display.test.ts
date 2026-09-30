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

test("a spoken name only ever resolves to a model the provider runs", () => {
  // The table keeps names for models a provider no longer runs (older chats
  // and activity rows still name them), but a name must never resolve to one.
  for (const [provider, rows] of Object.entries(MODEL_DISPLAY)) {
    const valid = VALID_MODELS[provider];
    if (!valid) continue;
    for (const name of Object.values(rows ?? {})) {
      const spoken = resolveSpokenModel(provider, name);
      if (spoken)
        expect(valid.has(spoken.id), `${provider} ${name}`).toBe(true);
    }
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
    "gpt-5.3 codex SPARK": "gpt-5.3-codex-spark",
  };
  for (const [spoken, id] of Object.entries(cases)) {
    expect(resolveSpokenModel("openai-codex", spoken)).toEqual({
      id,
      name: modelDisplayName("openai-codex", id),
      ambiguous: false,
    });
  }
});

test("an anthropic display name resolves to the exact lineup id it names", () => {
  const cases: Record<string, string> = {
    "Sonnet 5.5": "claude-sonnet-5-5",
    "Opus 5.5": "claude-opus-5-5",
    "opus 5.5": "claude-opus-5-5",
    "Fable 5.1": "claude-fable-5-1",
  };
  for (const [spoken, id] of Object.entries(cases)) {
    expect(resolveSpokenModel("anthropic", spoken)?.id).toBe(id);
  }
  // A retired model's name resolves to nothing: the caller refuses with the
  // lineup rather than pinning a model the provider no longer runs.
  for (const spoken of ["Opus 4.8", "Sonnet 4.6", "Haiku"])
    expect(resolveSpokenModel("anthropic", spoken)).toBeNull();
});

test("a bare family name lands on that family's one lineup model", () => {
  expect(resolveSpokenModel("anthropic", "Sonnet")).toEqual({
    id: "claude-sonnet-5-5",
    name: "Sonnet 5.5",
    ambiguous: false,
  });
  expect(resolveSpokenModel("anthropic", "opus")).toEqual({
    id: "claude-opus-5-5",
    name: "Opus 5.5",
    ambiguous: false,
  });
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
  // The provider serves one GPT row, and it is not the newest one: "gpt" must
  // land on what it CAN run, never on a row this caller does not offer.
  expect(resolveSpokenModel("openai-codex", "gpt", ["gpt-5.6-luna"])).toEqual({
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    ambiguous: false,
  });
  expect(
    resolveSpokenModel("anthropic", "opus", ["claude-sonnet-5-5"]),
  ).toBeNull();
});
