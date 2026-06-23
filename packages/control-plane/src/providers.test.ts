import { expect, test } from "bun:test";
import { hostProvider, isApiKeyProvider, isCloudProvider } from "./providers";

/**
 * The api-key submit route (`POST /agents/:id/credential/api-key`) 400s with
 * "unknown API-key provider" unless `isApiKeyProvider(id)` is true — so every
 * api-key provider the UI offers MUST be in this host registry. OpenRouter +
 * Gemini were missing here (only in the runtime + frontend catalogs), which 400d
 * the connect dialog. This pins the registry against that.
 */

test("every api-key provider the UI offers is accepted by the submit route", () => {
  for (const id of ["opencode", "opencode-go", "openrouter", "google"]) {
    expect(isApiKeyProvider(id)).toBe(true);
  }
});

test("OAuth + unknown providers are NOT api-key providers", () => {
  expect(isApiKeyProvider("anthropic")).toBe(false);
  expect(isApiKeyProvider("openai-codex")).toBe(false);
  expect(isApiKeyProvider("github-copilot")).toBe(false);
  expect(isApiKeyProvider("nope")).toBe(false);
});

test("github-copilot is a registered OAuth provider, LOCAL-only (not cloud)", () => {
  // Registered (so the OAuth login relays through, and the api-key submit route
  // correctly 400s a Copilot key attempt) but kept off the cloud per-turn
  // runtime: the egress-locked sandbox doesn't allowlist githubcopilot.com.
  expect(hostProvider("github-copilot")?.auth).toBe("oauth");
  expect(isCloudProvider("github-copilot")).toBe(false);
});

test("OpenRouter + Gemini are registered but LOCAL-only (cloud egress not allowlisted)", () => {
  expect(hostProvider("openrouter")?.auth).toBe("apiKey");
  expect(hostProvider("google")?.auth).toBe("apiKey");
  expect(isCloudProvider("openrouter")).toBe(false);
  expect(isCloudProvider("google")).toBe(false);
});
