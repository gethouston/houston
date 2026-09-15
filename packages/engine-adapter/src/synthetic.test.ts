import { expect, test } from "vitest";
import { toNewProvider, toOldProvider } from "./synthetic";

/**
 * The adapter's provider dialect is the DOMAIN's ladder and nothing else: a
 * hand-rolled branch beside the domain call is a second table waiting to drift.
 */

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
