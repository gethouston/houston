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
  expect(codex["gpt-5.4"]).toBe("gpt-6-astra");
  expect(codex["gpt-5-mini"]).toBe("gpt-6-luna");
  expect(codex["gpt-5.1-mini"]).toBe("gpt-6-luna");
  expect(codex["gpt-5.4-mini"]).toBe("gpt-6-luna");
});

test("a Codex id the subscription serves has NO alias row (never an upgrade)", () => {
  // gpt-5.5 is served again, so an alias for it would silently move a stored
  // pin onto gpt-6-astra — a model that spends the allowance far faster than
  // the one the user chose.
  expect(MODEL_ALIASES["openai-codex"]?.["gpt-5.5"]).toBeUndefined();
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
});
