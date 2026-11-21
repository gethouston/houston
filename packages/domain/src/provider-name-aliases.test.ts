import { expect, test } from "vitest";
import { PROVIDER_ALIASES } from "./provider-name-aliases";

test("the alias table is exactly what the hosted gateway mirrors", () => {
  expect({ ...PROVIDER_ALIASES }).toStrictEqual({
    openai: "openai-codex",
    codex: "openai-codex",
    chatgpt: "openai-codex",
    claude: "anthropic",
    gemini: "google",
    bedrock: "amazon-bedrock",
    copilot: "github-copilot",
  });
});
