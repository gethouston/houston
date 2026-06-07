import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { PROVIDERS } from "./providers.ts";
import {
  isApiKeyOnlyProvider,
  isDualPathConnectProvider,
  providerSupportsApiKeyConnect,
  saveProviderApiKey,
  MIN_PROVIDER_API_KEY_LENGTH,
} from "./provider-api-key.ts";

const openrouter = PROVIDERS.find((p) => p.id === "openrouter");
const anthropic = PROVIDERS.find((p) => p.id === "anthropic");
const openai = PROVIDERS.find((p) => p.id === "openai");
const VALID_KEY = `sk-test-${"x".repeat(MIN_PROVIDER_API_KEY_LENGTH)}`;

test.afterEach(() => {
  mock.restoreAll();
});

test("isApiKeyOnlyProvider(openrouter) is true", () => {
  assert.equal(isApiKeyOnlyProvider(openrouter), true);
});

test("anthropic and openai are dual-path connect providers", () => {
  assert.equal(isDualPathConnectProvider(anthropic), true);
  assert.equal(isDualPathConnectProvider(openai), true);
  assert.equal(isApiKeyOnlyProvider(anthropic), false);
  assert.equal(isApiKeyOnlyProvider(openai), false);
  assert.equal(providerSupportsApiKeyConnect(anthropic), true);
  assert.equal(providerSupportsApiKeyConnect(openai), true);
});

test("saveProviderApiKey target=local routes through saveLocalProviderApiKey", async () => {
  const saveLocalProviderApiKey = mock.fn(async () => {});
  mock.module("./local-provider-bridge.ts", {
    exports: { saveLocalProviderApiKey },
  });

  await saveProviderApiKey("openrouter", VALID_KEY, "local");

  assert.equal(saveLocalProviderApiKey.mock.callCount(), 1);
  assert.deepEqual(saveLocalProviderApiKey.mock.calls[0].arguments, [
    "openrouter",
    VALID_KEY,
  ]);
});

test("saveProviderApiKey target=activeAgent routes through resolveEngine", async () => {
  const setOpenRouterApiKey = mock.fn(async () => {});
  const resolveEngine = mock.fn(async () => ({
    setOpenRouterApiKey,
    setAnthropicApiKey: mock.fn(async () => {}),
    setOpenAiApiKey: mock.fn(async () => {}),
  }));
  const currentAgent = mock.fn(() => ({ folderPath: "/workspaces/ws/agent" }));

  mock.module("./agent-lookup.ts", {
    exports: {
      currentAgent,
      agentFromPath: mock.fn(() => null),
      registerAgentLookup: mock.fn(),
    },
  });
  mock.module("./engine-for-agent.ts", {
    exports: {
      resolveEngine,
      agentForEngine: mock.fn(() => null),
      resolveEngineForPath: mock.fn(async () => ({})),
    },
  });

  await saveProviderApiKey("openrouter", VALID_KEY, "activeAgent");

  assert.equal(currentAgent.mock.callCount(), 1);
  assert.equal(resolveEngine.mock.callCount(), 1);
  assert.deepEqual(resolveEngine.mock.calls[0].arguments, [
    { folderPath: "/workspaces/ws/agent" },
  ]);
  assert.equal(setOpenRouterApiKey.mock.callCount(), 1);
  assert.deepEqual(setOpenRouterApiKey.mock.calls[0].arguments, [VALID_KEY]);
});

test("saveProviderApiKey rejects unknown providers on local target", async () => {
  mock.module("./local-provider-bridge.ts", {
    exports: {
      saveLocalProviderApiKey: mock.fn(async (providerId) => {
        throw new Error(`Provider "${providerId}" does not support API key connect`);
      }),
    },
  });

  await assert.rejects(
    () => saveProviderApiKey("unknown", VALID_KEY, "local"),
    /Provider "unknown" does not support API key connect/,
  );
});

test("saveProviderApiKey rejects unknown providers on activeAgent target", async () => {
  const setOpenRouterApiKey = mock.fn(async () => {});
  mock.module("./engine-for-agent.ts", {
    exports: {
      resolveEngine: mock.fn(async () => ({
        setOpenRouterApiKey,
        setAnthropicApiKey: mock.fn(async () => {}),
        setOpenAiApiKey: mock.fn(async () => {}),
      })),
      agentForEngine: mock.fn(() => null),
      resolveEngineForPath: mock.fn(async () => ({})),
    },
  });
  mock.module("./agent-lookup.ts", {
    exports: {
      currentAgent: mock.fn(() => ({ folderPath: "/agent" })),
      agentFromPath: mock.fn(() => null),
      registerAgentLookup: mock.fn(),
    },
  });

  await assert.rejects(
    () => saveProviderApiKey("unknown", VALID_KEY, "activeAgent"),
    /Provider "unknown" does not support API key connect/,
  );
  assert.equal(setOpenRouterApiKey.mock.callCount(), 0);
});
