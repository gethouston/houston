import { expect, test } from "vitest";
import { MODEL_ALIASES } from "./model-aliases";
import { DEFAULT_MODEL } from "./provider-default-models";

const anthropic = () => MODEL_ALIASES.anthropic ?? {};

test("the sonnet 'latest' aliases resolve to the CURRENT Anthropic default", () => {
  // A "latest" alias that lands on anything but the model a fresh Anthropic
  // connect selects is a lie: the same user, saying "sonnet" and saying
  // nothing, would get two different models.
  expect(anthropic().sonnet).toBe(DEFAULT_MODEL.anthropic);
  expect(anthropic()["claude-sonnet-latest"]).toBe(DEFAULT_MODEL.anthropic);
});

test("the other tiers keep their own current id (there is one default, not three)", () => {
  // opus/haiku have no entry in DEFAULT_MODEL — the table holds ONE default per
  // provider, not one per tier — so those aliases stay hand-pinned.
  expect(anthropic().opus).toBe("claude-opus-5");
  expect(anthropic()["claude-opus-latest"]).toBe("claude-opus-5");
  expect(anthropic().haiku).toBe("claude-haiku-4-5");
  expect(anthropic()["claude-haiku-latest"]).toBe("claude-haiku-4-5");
});

test("legacy dated/retired ids stay pinned at their tier (never an auto-upgrade)", () => {
  const codex = MODEL_ALIASES["openai-codex"] ?? {};
  expect(codex["gpt-5.5"]).toBe("gpt-6-astra");
  expect(codex["gpt-5-mini"]).toBe("gpt-5.4-mini");
  expect(codex["gpt-5.1-mini"]).toBe("gpt-5.4-mini");
});
