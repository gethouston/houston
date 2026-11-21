import { expect, test } from "vitest";
import { hostProvider, isApiKeyProvider, isCloudProvider } from "./providers";

test("the curated api-key providers are still accepted by the submit route", () => {
  for (const id of [
    "opencode",
    "opencode-go",
    "openrouter",
    "deepseek",
    "google",
    "amazon-bedrock",
    "minimax",
  ]) {
    expect(isApiKeyProvider(id)).toBe(true);
  }
});

test("ARBITRARY pi api-key providers (never curated here) are accepted", () => {
  for (const id of [
    "groq",
    "mistral",
    "xai",
    "together",
    "fireworks",
    "cerebras",
    "nvidia",
  ]) {
    expect(isApiKeyProvider(id)).toBe(true);
  }
});

test("OAuth providers are NOT treated as api-key providers", () => {
  expect(isApiKeyProvider("anthropic")).toBe(false);
  expect(isApiKeyProvider("openai-codex")).toBe(false);
  expect(isApiKeyProvider("github-copilot")).toBe(false);
});

test("ids pi-ai does not know are still rejected", () => {
  expect(isApiKeyProvider("nope")).toBe(false);
  expect(isApiKeyProvider("definitely-not-a-provider")).toBe(false);
  expect(isApiKeyProvider("")).toBe(false);
});

test("github-copilot is a registered OAuth provider, LOCAL-only (not cloud)", () => {
  expect(hostProvider("github-copilot")?.auth).toBe("oauth");
  expect(isCloudProvider("github-copilot")).toBe(false);
});

test("OpenRouter, DeepSeek, Gemini, Bedrock, and MiniMax are registered but LOCAL-only", () => {
  expect(hostProvider("openrouter")?.auth).toBe("apiKey");
  expect(hostProvider("deepseek")?.auth).toBe("apiKey");
  expect(hostProvider("google")?.auth).toBe("apiKey");
  expect(hostProvider("amazon-bedrock")?.auth).toBe("apiKey");
  expect(hostProvider("minimax")?.auth).toBe("apiKey");
  expect(isCloudProvider("openrouter")).toBe(false);
  expect(isCloudProvider("deepseek")).toBe(false);
  expect(isCloudProvider("google")).toBe(false);
  expect(isCloudProvider("amazon-bedrock")).toBe(false);
  expect(isCloudProvider("minimax")).toBe(false);
  expect(hostProvider("minimax")?.models).toEqual([
    "MiniMax-M3.1-Flash",
    "MiniMax-M3",
  ]);
  expect(hostProvider("minimax")?.defaultModel).toBe("MiniMax-M3.1-Flash");
});

test("openai-compatible is registered, NOT api-key, and LOCAL-only", () => {
  expect(hostProvider("openai-compatible")?.auth).toBe("openaiCompatible");
  expect(isApiKeyProvider("openai-compatible")).toBe(false);
  expect(isCloudProvider("openai-compatible")).toBe(false);
});
