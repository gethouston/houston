import { expect, test } from "vitest";
import { credentialSiblings } from "./credential-siblings";

test("opencode and opencode-go share a credential, both directions", () => {
  // The two OpenCode gateways authenticate with the same opencode.ai key.
  expect(credentialSiblings("opencode")).toEqual(["opencode-go"]);
  expect(credentialSiblings("opencode-go")).toEqual(["opencode"]);
});

test("a provider is never listed as its own sibling", () => {
  expect(credentialSiblings("opencode")).not.toContain("opencode");
  expect(credentialSiblings("opencode-go")).not.toContain("opencode-go");
});

test("providers with no shared credential have no siblings", () => {
  for (const id of [
    "anthropic",
    "openai-codex",
    "github-copilot",
    "openrouter",
    "deepseek",
    "google",
    "amazon-bedrock",
    "minimax",
    "openai-compatible",
    "totally-unknown",
  ]) {
    expect(credentialSiblings(id)).toEqual([]);
  }
});
