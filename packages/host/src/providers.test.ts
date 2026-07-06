import { expect, test } from "vitest";
import { hostProvider, isApiKeyProvider, isCloudProvider } from "./providers";

/**
 * The api-key submit route (`POST /agents/:id/credential/api-key`) 400s with
 * "unknown API-key provider" unless `isApiKeyProvider(id)` is true. The gate is
 * now pi-DERIVED (any pi-ai provider that is not an OAuth provider), NOT the
 * curated host catalog below — so every provider pi-ai can run with a pasted key
 * connects generically, not just the hand-tuned cloud set. These tests pin that
 * predicate: the curated api-key ids still pass, arbitrary pi providers pass, and
 * OAuth / unknown-to-pi ids are still rejected.
 */

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
  // The whole point of the pi-derived gate: providers Houston never hand-listed —
  // groq, mistral, xai, together, fireworks, cerebras, nvidia — connect with a
  // pasted key because pi-ai knows them and they are not OAuth providers.
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
  // The three pi OAuth providers route to their sign-in flow, never the key route.
  expect(isApiKeyProvider("anthropic")).toBe(false);
  expect(isApiKeyProvider("openai-codex")).toBe(false);
  expect(isApiKeyProvider("github-copilot")).toBe(false);
});

test("ids pi-ai does not know are still rejected", () => {
  // A typo / made-up provider id has no pi model registry, so the key route must
  // still 400 it rather than storing a credential no turn could ever resolve.
  expect(isApiKeyProvider("nope")).toBe(false);
  expect(isApiKeyProvider("definitely-not-a-provider")).toBe(false);
  expect(isApiKeyProvider("")).toBe(false);
});

test("github-copilot is a registered OAuth provider, LOCAL-only (not cloud)", () => {
  // Registered (so the OAuth login relays through, and the api-key submit route
  // correctly 400s a Copilot key attempt) but kept off the cloud per-turn
  // runtime: the egress-locked sandbox doesn't allowlist githubcopilot.com.
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
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M3",
  ]);
});

test("openai-compatible is registered, NOT api-key, and LOCAL-only", () => {
  // Its own auth method (base URL + model, not a pasted gateway key), so the
  // api-key submit route must NOT accept it — it has a dedicated route gated on
  // the deployment's openaiCompatible capability.
  expect(hostProvider("openai-compatible")?.auth).toBe("openaiCompatible");
  expect(isApiKeyProvider("openai-compatible")).toBe(false);
  // Never offered by a cloud runtime: localhost is unreachable from the cloud.
  expect(isCloudProvider("openai-compatible")).toBe(false);
});
