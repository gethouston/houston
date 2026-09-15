import { bus } from "@houston/engine-adapter/bus";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureCredential: vi.fn<() => Promise<void>>(),
  claimActiveProvider: vi.fn<() => Promise<void>>(),
  authStatus: vi.fn(),
}));

vi.mock("@houston/engine-adapter/control-plane", () => ({
  agentPath: (id: string) => `/agents/${encodeURIComponent(id)}`,
  agentIdOfPath: () => null,
  runtimeClientFor: () => ({
    authStatus: mocks.authStatus,
    claimActiveProvider: mocks.claimActiveProvider,
  }),
  setupRuntimeClientFor: vi.fn(),
}));

const { pollProviderConnect } = await import(
  "@houston/engine-adapter/client/provider-login-poll"
);

beforeEach(() => {
  vi.useFakeTimers();
  mocks.captureCredential.mockReset();
  mocks.claimActiveProvider.mockReset().mockResolvedValue();
  mocks.authStatus.mockReset().mockResolvedValue({
    providers: [
      {
        provider: "openai-codex",
        configured: true,
        login: { status: "complete" },
      },
    ],
  });
});

afterEach(() => vi.useRealTimers());

/** The capture is `sdk.providers.credentials`' now, so the SDK is the seam. */
function context() {
  return {
    cp: { baseUrl: "https://example.test", token: "token" },
    activeLogins: new Set<string>(),
    sdk: {
      providers: {
        credentials: {
          captureCredential: mocks.captureCredential,
          captureSetupCredential: vi.fn(),
        },
      },
    },
  } as never;
}

async function runAndCollect() {
  const events: unknown[] = [];
  const unsubscribe = bus.on((event) => events.push(event));
  const polling = pollProviderConnect(
    context(),
    "agent-1",
    "openai-codex",
    "openai",
  );
  await vi.runAllTimersAsync();
  await polling;
  unsubscribe();
  return events;
}

test("capture retries transient failures before reporting login success", async () => {
  mocks.captureCredential
    .mockRejectedValueOnce(new Error("capture unavailable"))
    .mockRejectedValueOnce(new Error("capture unavailable"))
    .mockResolvedValueOnce();

  const events = await runAndCollect();

  expect(mocks.captureCredential).toHaveBeenCalledTimes(3);
  expect(events).toContainEqual({
    type: "ProviderLoginComplete",
    data: { provider: "openai", success: true, error: null },
  });
});

test("persistent capture failure reports login failure", async () => {
  mocks.captureCredential.mockRejectedValue(new Error("capture unavailable"));

  const events = await runAndCollect();

  expect(mocks.captureCredential).toHaveBeenCalledTimes(3);
  expect(events).toContainEqual({
    type: "ProviderLoginComplete",
    data: {
      provider: "openai",
      success: false,
      error: "capture unavailable",
    },
  });
  expect(events).not.toContainEqual({
    type: "ProviderLoginComplete",
    data: { provider: "openai", success: true, error: null },
  });
});
