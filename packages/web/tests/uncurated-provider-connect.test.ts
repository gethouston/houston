import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * The pi-ai catalog is OPEN (~35 providers), and the host's api-key connect
 * route accepts any non-OAuth pi provider. The adapter's `toNewProvider` used to
 * enumerate only the curated ids and return null for everything else — so
 * pasting a key for an uncurated provider (mistral, groq, xai, nvidia,
 * huggingface, google-vertex, zai, ...) hard-failed with "provider not
 * supported" BEFORE any network call, the status probe never showed it
 * connected, and sign-out silently no-oped. These tests pin the pass-through:
 * only Codex is renamed; every other id flows to the engine verbatim.
 */

const { setApiKey, claimActiveProvider, forgetCredential, logout } = vi.hoisted(
  () => ({
    setApiKey: vi.fn(),
    claimActiveProvider: vi.fn(),
    forgetCredential: vi.fn(),
    logout: vi.fn(),
  }),
);

vi.mock("../src/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    setApiKey,
    forgetCredential,
    runtimeClientFor: vi.fn(() => ({ claimActiveProvider, logout })),
  };
});

import { HoustonClient } from "../src/engine-adapter/client";
import {
  credentialSiblings,
  toNewProvider,
} from "../src/engine-adapter/synthetic";

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) =>
      k === "houston.pref.last_agent_id" ? "agent-1" : null,
    setItem: () => {},
    removeItem: () => {},
  };
  setApiKey.mockReset().mockResolvedValue(undefined);
  claimActiveProvider.mockReset().mockResolvedValue(undefined);
  forgetCredential.mockReset().mockResolvedValue(undefined);
  logout.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

function client() {
  return new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
}

test("toNewProvider renames only Codex and passes every other id through", () => {
  expect(toNewProvider("openai")).toBe("openai-codex");
  expect(toNewProvider("codex")).toBe("openai-codex");
  expect(toNewProvider("openai-codex")).toBe("openai-codex");
  // Curated ids are unchanged.
  expect(toNewProvider("anthropic")).toBe("anthropic");
  expect(toNewProvider("opencode-go")).toBe("opencode-go");
  expect(toNewProvider("openai-compatible")).toBe("openai-compatible");
  // Uncurated pi providers pass through verbatim (the open-catalog rule).
  for (const id of [
    "mistral",
    "groq",
    "xai",
    "nvidia",
    "huggingface",
    "google-vertex",
    "zai",
    "cerebras",
  ]) {
    expect(toNewProvider(id)).toBe(id);
  }
  // Null only for an empty name.
  expect(toNewProvider("")).toBeNull();
});

test("credentialSiblings fans out only the OpenCode gateways", () => {
  expect(credentialSiblings("opencode")).toEqual(["opencode", "opencode-go"]);
  expect(credentialSiblings("mistral")).toEqual(["mistral"]);
});

test("setProviderApiKey connects an uncurated pi provider instead of throwing", async () => {
  await client().setProviderApiKey("mistral", "sk-mistral-key");

  expect(setApiKey).toHaveBeenCalledTimes(1);
  expect(setApiKey.mock.calls[0].slice(2)).toEqual([
    "mistral",
    "sk-mistral-key",
  ]);
  expect(claimActiveProvider).toHaveBeenCalledWith("mistral");
});

test("providerLogout clears an uncurated pi provider instead of no-oping", async () => {
  await client().providerLogout("groq");

  expect(forgetCredential).toHaveBeenCalledTimes(1);
  expect(forgetCredential.mock.calls[0][2]).toBe("groq");
  expect(logout).toHaveBeenCalledWith("groq");
});
