import { describe, expect, test } from "bun:test";
import { EngineError } from "@houston/runtime-client";
import { configWriteToSettings } from "./synthetic";
import { turnErrorMessage } from "./translate";

test("turnErrorMessage unwraps the engine's plain message from a rejected send", () => {
  // The runtime refuses a not-connected turn with 409 + a JSON body; the user must
  // see the plain sentence, never the status code or the JSON wrapper.
  const err = new EngineError(
    409,
    JSON.stringify({
      error: "No provider connected. Log in with Claude or Codex first.",
    }),
  );
  expect(turnErrorMessage(err)).toBe(
    "No provider connected. Log in with Claude or Codex first.",
  );
});

test("turnErrorMessage falls back to the raw message for a non-JSON engine body", () => {
  const err = new EngineError(500, "upstream exploded");
  expect(turnErrorMessage(err)).toBe(err.message);
});

test("turnErrorMessage handles plain errors and non-errors", () => {
  expect(turnErrorMessage(new Error("boom"))).toBe("boom");
  expect(turnErrorMessage("just a string")).toBe("just a string");
});

describe("configWriteToSettings (model-pick → engine settings bridge)", () => {
  const CONFIG = ".houston/config/config.json";

  test("carries the reasoning effort through to the settings update", () => {
    // opencode is an open-catalog gateway — its arbitrary model passes through.
    expect(
      configWriteToSettings(
        CONFIG,
        JSON.stringify({
          provider: "opencode",
          model: "deepseek-v4-pro",
          effort: "high",
        }),
      ),
    ).toEqual({
      activeProvider: "opencode",
      model: "deepseek-v4-pro",
      effort: "high",
    });
    // Provider-only write (no effort) omits effort; the model defaults to the
    // provider's default (the runtime needs a concrete settings.models entry).
    expect(
      configWriteToSettings(CONFIG, JSON.stringify({ provider: "opencode" })),
    ).toEqual({ activeProvider: "opencode", model: "claude-sonnet-4-6" });
  });

  test("maps a config write with provider+model to a settings update", () => {
    expect(
      configWriteToSettings(
        CONFIG,
        JSON.stringify({ provider: "opencode-go", model: "deepseek-v4-pro" }),
      ),
    ).toEqual({ activeProvider: "opencode-go", model: "deepseek-v4-pro" });
    // The old desktop "openai" id is remapped to the engine's "openai-codex".
    expect(
      configWriteToSettings(
        CONFIG,
        JSON.stringify({ provider: "openai", model: "gpt-5.5" }),
      ),
    ).toEqual({ activeProvider: "openai-codex", model: "gpt-5.5" });
    // A bare legacy tier name is migrated to a real pi id at the same tier.
    expect(
      configWriteToSettings(
        CONFIG,
        JSON.stringify({ provider: "anthropic", model: "opus" }),
      ),
    ).toEqual({ activeProvider: "anthropic", model: "claude-opus-4-8" });
  });

  test("migrates an unknown provider to the default instead of dropping it", () => {
    // Gemini was dropped — a stored gemini agent must NOT silently no-op (every
    // turn would then run the active provider's default with no record). It
    // migrates to the default provider + model so the turn still runs.
    expect(
      configWriteToSettings(CONFIG, JSON.stringify({ provider: "gemini" })),
    ).toEqual({ activeProvider: "openai-codex", model: "gpt-5.5" });
  });

  test("skips non-config files, missing provider, and bad JSON", () => {
    expect(
      configWriteToSettings(".houston/learnings/learnings.json", "{}"),
    ).toBeNull();
    expect(configWriteToSettings("CLAUDE.md", "# hi")).toBeNull();
    expect(
      configWriteToSettings(CONFIG, JSON.stringify({ model: "x" })),
    ).toBeNull(); // no provider
    expect(configWriteToSettings(CONFIG, "not json")).toBeNull();
  });
});
