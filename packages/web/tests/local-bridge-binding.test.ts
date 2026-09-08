import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  ports: vi.fn(),
  report: vi.fn(),
  dispose: vi.fn(),
  subscribe: vi.fn(),
  constructed: vi.fn(),
}));
vi.mock("@houston/sdk", () => ({
  LocalModelBridgeController: class {
    dispose = mocks.dispose;
    subscribe = mocks.subscribe;
    constructor(ports: unknown) {
      mocks.constructed(ports);
    }
  },
}));
vi.mock("../../../app/src/stores/agents", () => ({
  useAgentStore: { getState: () => ({ current: { id: "agent" } }) },
}));
vi.mock("../../../app/src/lib/engine", () => ({
  getEngine: () => ({ getLocalModelBridgeAccess: mocks.access }),
}));
vi.mock("../../../app/src/lib/local-bridge-ports", () => ({
  desktopBridgePorts: mocks.ports,
  reportLocalBridgeError: mocks.report,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const access = {
  identity: {
    environment: "https://gateway.example",
    orgId: "org",
    userId: "owner",
    agentId: "agent",
  },
};
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubGlobal("window", {
    __HOUSTON_ENGINE__: { baseUrl: access.identity.environment },
    __HOUSTON_ACTIVE_ORG__: "org",
  });
  mocks.access.mockResolvedValue(access);
  mocks.dispose.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

test("scope invalidation fences an access request that completes late", async () => {
  const binding = await import("../../../app/src/lib/local-bridge-binding");
  const discovery = deferred<typeof access>();
  mocks.access.mockReturnValueOnce(discovery.promise);
  const pending = binding.localBridgeController("owner");
  binding.invalidateLocalBridgeBinding();
  discovery.resolve(access);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(mocks.constructed).not.toHaveBeenCalled();
  expect(binding.localBridgeSnapshot().status).toBe("disabled");
});

test("late status from a retired controller cannot overwrite the new scope", async () => {
  const binding = await import("../../../app/src/lib/local-bridge-binding");
  await binding.localBridgeController("owner");
  const oldListener = mocks.subscribe.mock.calls[0]?.[0] as (
    value: unknown,
  ) => void;
  binding.invalidateLocalBridgeBinding();
  oldListener({ status: "online", journal: null });
  expect(binding.localBridgeSnapshot().status).toBe("disabled");
  expect(mocks.dispose).toHaveBeenCalledOnce();
});

test("a failed bootstrap can retry instead of retaining a rejected promise", async () => {
  const binding = await import("../../../app/src/lib/local-bridge-binding");
  mocks.access.mockRejectedValueOnce(new Error("unavailable"));
  await expect(binding.localBridgeController("owner")).rejects.toThrow(
    "unavailable",
  );
  await expect(binding.localBridgeController("owner")).resolves.not.toBeNull();
  expect(mocks.access).toHaveBeenCalledTimes(2);
});

test("the next identity waits until the old native transport has stopped", async () => {
  const binding = await import("../../../app/src/lib/local-bridge-binding");
  await binding.localBridgeController("owner");
  const stopped = deferred<void>();
  mocks.dispose.mockReturnValueOnce(stopped.promise);
  mocks.access.mockResolvedValueOnce({
    identity: { ...access.identity, userId: "next-owner" },
  });
  const next = binding.localBridgeController("next-owner");
  await Promise.resolve();
  expect(mocks.access).toHaveBeenCalledTimes(1);
  stopped.resolve();
  await next;
  expect(mocks.access).toHaveBeenCalledTimes(2);
});

test("a teardown failure is reported and retried before starting another scope", async () => {
  const binding = await import("../../../app/src/lib/local-bridge-binding");
  await binding.localBridgeController("owner");
  const failure = new Error("stop failed");
  mocks.dispose.mockRejectedValueOnce(failure);
  binding.invalidateLocalBridgeBinding();
  await binding.localBridgeController("owner");
  expect(mocks.report).toHaveBeenCalledWith(failure);
  expect(mocks.dispose).toHaveBeenCalledTimes(2);
  expect(mocks.constructed).toHaveBeenCalledTimes(2);
});
