import { expect, test } from "vitest";
import {
  configWriteToSettings,
  toNewProvider,
  toOldProvider,
} from "./synthetic";

test("every legacy and spoken name resolves through the domain ladder", () => {
  expect(toNewProvider("codex")).toBe("openai-codex");
  expect(toNewProvider("openai")).toBe("openai-codex");
  expect(toNewProvider("chatgpt")).toBe("openai-codex");
  expect(toNewProvider("claude")).toBe("anthropic");
  expect(toNewProvider("gemini")).toBe("google");
  expect(toNewProvider("bedrock")).toBe("amazon-bedrock");
});

test("the open catalog passes through: an uncurated pi provider keeps its id", () => {
  for (const id of ["groq", "mistral", "xai", "openai-compatible"])
    expect(toNewProvider(id), id).toBe(id);
});

test("an empty name is absent, not a pick", () => {
  expect(toNewProvider("")).toBeNull();
});

test("the reverse direction is the same one dialect map", () => {
  expect(toOldProvider("openai-codex")).toBe("openai");
  expect(toOldProvider("anthropic")).toBe("anthropic");
});

const CONFIG = "default/.assistant/.houston/config/config.json";

test("a provider+model+effort config write mirrors all three into the runtime", () => {
  expect(
    configWriteToSettings(
      CONFIG,
      JSON.stringify({
        provider: "openai",
        model: "gpt-6-astra",
        effort: "high",
      }),
    ),
  ).toEqual({
    activeProvider: "openai-codex",
    model: "gpt-6-astra",
    effort: "high",
  });
});

test("an effort-only config write still reaches the runtime", () => {
  expect(
    configWriteToSettings(CONFIG, JSON.stringify({ effort: "max" })),
  ).toEqual({ effort: "max" });
});

test("a model with no provider is not forwarded", () => {
  expect(
    configWriteToSettings(CONFIG, JSON.stringify({ model: "gpt-6-astra" })),
  ).toBeNull();
  expect(
    configWriteToSettings(
      CONFIG,
      JSON.stringify({ model: "gpt-6-astra", effort: "low" }),
    ),
  ).toEqual({ effort: "low" });
});

test("other files, empty docs and broken JSON imply no settings write", () => {
  expect(configWriteToSettings("a/.houston/learnings.md", "{}")).toBeNull();
  expect(configWriteToSettings(CONFIG, "{}")).toBeNull();
  expect(
    configWriteToSettings(CONFIG, JSON.stringify({ effort: "" })),
  ).toBeNull();
  expect(configWriteToSettings(CONFIG, "{not json")).toBeNull();
});
