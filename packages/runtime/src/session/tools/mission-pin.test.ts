import type { ProviderOption } from "@houston/domain";
import { expect, test } from "vitest";
import { missionPin, missionRunsOn, resolveMissionPin } from "./mission-pin";

/**
 * What a written provider/model becomes, and what the tool then claims the
 * mission runs on. A provider id is never something the model has to invent
 * (the `codex` → `openai-codex` incident), and the inheritance default is
 * load-bearing on managed cloud: an unpinned child turn is refused with "No
 * provider connected" because the runtime holds no standing provider — the
 * parent turn's resolved pair is the one known-good pin.
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

const PARENT = { provider: "anthropic", model: "claude-sonnet-5" };

test("a written provider resolves to its id, alias or display name alike", () => {
  expect(resolveMissionPin({ provider: "Codex" }, OPTIONS)).toEqual({
    ok: true,
    pin: {
      provider: "openai-codex",
    },
  });
  expect(
    resolveMissionPin({ provider: "OpenRouter", model: "any/thing" }, OPTIONS),
  ).toEqual({ ok: true, pin: { provider: "openrouter", model: "any/thing" } });
});

test("an unknown provider returns the list of ids and names", () => {
  expect(resolveMissionPin({ provider: "gemini-cli" }, OPTIONS)).toMatchObject({
    ok: false,
    error: {
      code: "invalid_provider",
      message: expect.stringMatching(
        /openai-codex \(ChatGPT \/ Codex \(Plus \/ Pro\)\)/,
      ),
    },
  });
});

test("a disconnected provider returns a refusal naming it", () => {
  expect(resolveMissionPin({ provider: "claude" }, OPTIONS)).toMatchObject({
    ok: false,
    error: {
      code: "invalid_provider",
      message: expect.stringMatching(/anthropic .*not connected/i),
    },
  });
});

test("a model is validated against the provider the same call pins", () => {
  expect(
    resolveMissionPin({ provider: "codex", model: "gpt5" }, OPTIONS),
  ).toMatchObject({
    ok: false,
    error: {
      code: "invalid_provider",
      message: expect.stringMatching(/gpt-5.5-codex/),
    },
  });
  expect(
    resolveMissionPin({ provider: "codex", model: "gpt-5.5" }, OPTIONS),
  ).toEqual({ ok: true, pin: { provider: "openai-codex", model: "gpt-5.5" } });
});

test("a model named alone is validated against the inherited provider", () => {
  expect(
    resolveMissionPin({ model: "gpt5" }, OPTIONS, "openai-codex"),
  ).toMatchObject({
    ok: false,
    error: {
      code: "invalid_provider",
      message: expect.stringMatching(/gpt-5.5/),
    },
  });
  expect(
    resolveMissionPin({ model: "gpt-5.5" }, OPTIONS, "openai-codex"),
  ).toEqual({ ok: true, pin: { model: "gpt-5.5" } });
  // Nothing to validate against: the model rides through and the provider's own
  // error is what surfaces.
  expect(resolveMissionPin({ model: "whatever" }, OPTIONS)).toEqual({
    ok: true,
    pin: {
      model: "whatever",
    },
  });
});

test("the name the user said pins the model, never the provider default", () => {
  expect(
    resolveMissionPin({ provider: "codex", model: "Luna" }, NAMED),
  ).toEqual({
    ok: true,
    pin: { provider: "openai-codex", model: "gpt-5.6-luna" },
  });
  expect(
    resolveMissionPin({ provider: "anthropic", model: "Opus 4.6" }, NAMED),
  ).toEqual({
    ok: true,
    pin: { provider: "anthropic", model: "claude-opus-4-6" },
  });
  // A name alone rides the provider the mission inherits.
  expect(
    resolveMissionPin({ model: "5.4 mini" }, NAMED, "openai-codex"),
  ).toEqual({ ok: true, pin: { model: "gpt-5.4-mini" } });
});

// --- the pin the child mission actually carries ----------------------------

test("no explicit choice inherits the parent turn's provider AND model", () => {
  expect(missionPin({}, PARENT)).toEqual(PARENT);
});

test("an explicit provider stands alone — never mixed with the parent's model id", () => {
  expect(missionPin({ provider: "openai" }, PARENT)).toEqual({
    provider: "openai",
  });
  expect(missionPin({ provider: "openai", model: "gpt-5.5" }, PARENT)).toEqual({
    provider: "openai",
    model: "gpt-5.5",
  });
});

test("a model named without a provider rides the inherited provider", () => {
  expect(missionPin({ model: "claude-opus-5" }, PARENT)).toEqual({
    provider: "anthropic",
    model: "claude-opus-5",
  });
});

test("outside a turn (nothing inherited) the explicit params pass through", () => {
  expect(missionPin({}, undefined)).toEqual({});
  expect(missionPin({ model: "m" }, undefined)).toEqual({ model: "m" });
});

test("what the tool tells the user names the model it really pinned", () => {
  const text = missionRunsOn(
    { provider: "anthropic", model: "claude-sonnet-5" },
    NAMED,
  );
  expect(text).toContain("claude-sonnet-5 (Sonnet 5)");
  expect(text).toContain("anthropic (Claude (Pro / Max))");
});

test("a mission with no pin claims nothing at all", () => {
  expect(missionRunsOn({}, NAMED)).toBe("");
});
