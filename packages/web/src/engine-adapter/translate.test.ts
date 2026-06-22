import { test, expect, describe } from "bun:test";
import { EngineError } from "@houston/runtime-client";
import { turnErrorMessage } from "./translate";
import { configWriteToSettings } from "./synthetic";

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

  test("maps a config write with provider+model to a settings update", () => {
    expect(
      configWriteToSettings(CONFIG, JSON.stringify({ provider: "opencode-go", model: "deepseek-v4-pro" })),
    ).toEqual({ activeProvider: "opencode-go", model: "deepseek-v4-pro" });
    // The old desktop "openai" id is remapped to the engine's "openai-codex".
    expect(
      configWriteToSettings(CONFIG, JSON.stringify({ provider: "openai", model: "gpt-5.5" })),
    ).toEqual({ activeProvider: "openai-codex", model: "gpt-5.5" });
  });

  test("sets activeProvider even when no model is given (provider switch)", () => {
    expect(configWriteToSettings(CONFIG, JSON.stringify({ provider: "opencode" }))).toEqual({
      activeProvider: "opencode",
    });
  });

  test("skips non-config files, unknown providers, and bad JSON", () => {
    expect(configWriteToSettings(".houston/learnings/learnings.json", "{}"))
      .toBeNull();
    expect(configWriteToSettings("CLAUDE.md", "# hi")).toBeNull();
    expect(configWriteToSettings(CONFIG, JSON.stringify({ provider: "gemini" }))).toBeNull();
    expect(configWriteToSettings(CONFIG, JSON.stringify({ model: "x" }))).toBeNull(); // no provider
    expect(configWriteToSettings(CONFIG, "not json")).toBeNull();
  });
});
