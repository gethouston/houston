import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { setApiKey, claimActiveProvider, forgetCredential, logout } = vi.hoisted(
  () => ({
    setApiKey: vi.fn(),
    claimActiveProvider: vi.fn(),
    forgetCredential: vi.fn(),
    logout: vi.fn(),
  }),
);

vi.mock("@houston/engine-adapter/control-plane", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@houston/engine-adapter/control-plane")
    >();
  return {
    ...actual,
    runtimeClientFor: vi.fn(() => ({ claimActiveProvider, logout })),
  };
});

import { HoustonClient } from "@houston/engine-adapter/client";
import {
  credentialSiblings,
  toNewProvider,
} from "@houston/engine-adapter/synthetic";
import {
  restoreAgentListFetch,
  stubAgentListFetch,
  wireAgent,
} from "./support/agent-list";

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
  stubAgentListFetch([wireAgent("agent-1")]);
});

afterEach(() => {
  restoreAgentListFetch();
  vi.clearAllMocks();
});

async function client() {
  const c = new HoustonClient({
    baseUrl: "http://host",
    token: "t",
    controlPlane: true,
  });
  const credentials = c.engineSdk.providers.credentials;
  vi.spyOn(credentials, "setApiKey").mockImplementation(setApiKey);
  vi.spyOn(credentials, "forgetCredential").mockImplementation(
    forgetCredential,
  );
  await c.listAgents("ws");
  return c;
}

test("toNewProvider renames only Codex and passes every other id through", () => {
  expect(toNewProvider("openai")).toBe("openai-codex");
  expect(toNewProvider("codex")).toBe("openai-codex");
  expect(toNewProvider("openai-codex")).toBe("openai-codex");
  expect(toNewProvider("anthropic")).toBe("anthropic");
  expect(toNewProvider("opencode-go")).toBe("opencode-go");
  expect(toNewProvider("openai-compatible")).toBe("openai-compatible");
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
  expect(toNewProvider("")).toBeNull();
});

test("credentialSiblings fans out only the OpenCode gateways", () => {
  expect(credentialSiblings("opencode")).toEqual(["opencode", "opencode-go"]);
  expect(credentialSiblings("mistral")).toEqual(["mistral"]);
});

test("setProviderApiKey connects an uncurated pi provider instead of throwing", async () => {
  await (await client()).setProviderApiKey("mistral", "sk-mistral-key");

  expect(setApiKey).toHaveBeenCalledTimes(1);
  expect(setApiKey.mock.calls[0].slice(1)).toEqual([
    "mistral",
    "sk-mistral-key",
    undefined,
  ]);
  expect(claimActiveProvider).toHaveBeenCalledWith("mistral");
});

test("providerLogout clears an uncurated pi provider instead of no-oping", async () => {
  await (await client()).providerLogout("groq");

  expect(forgetCredential).toHaveBeenCalledTimes(1);
  expect(forgetCredential.mock.calls[0][1]).toBe("groq");
  expect(logout).toHaveBeenCalledWith("groq");
});
