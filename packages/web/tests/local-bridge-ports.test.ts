import type { LocalBridgeNativeEvent } from "@houston/sdk";
import { beforeEach, expect, test, vi } from "vitest";
import type { LocalModelBridgeAccess } from "../../../ui/engine-client/src/local-model-bridge";

const native = vi.hoisted(() => ({
  listen: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  renew: vi.fn(),
  report: vi.fn(),
}));
vi.mock("../../../app/src/lib/os-bridge", () => ({
  legacyListen: native.listen,
  osStartLocalBridge: native.start,
  osStopLocalBridge: native.stop,
  osRenewLocalBridge: native.renew,
  osSavedBridgeTarget: vi.fn(),
  osSaveBridgeTarget: vi.fn(),
  osForgetBridgeTarget: vi.fn(),
  osLocalBridgeDevice: vi.fn(),
  osCompleteBridgeMigration: vi.fn(),
  osLocalBridgeLegacyCandidate: vi.fn(),
}));
vi.mock("../../../app/src/lib/error-toast", () => ({
  showErrorToast: native.report,
}));

import { desktopBridgePorts } from "../../../app/src/lib/local-bridge-ports";

const identity = {
  environment: "https://gateway.example",
  userId: "owner",
  orgId: "org",
  agentId: "agent",
};
function management(): LocalModelBridgeAccess {
  return {
    identity,
    register: vi.fn(),
    session: vi.fn(),
    status: vi.fn(),
    revoke: vi.fn(),
    saveEndpoint: vi.fn(),
    clearEndpoint: vi.fn(),
    legacyEndpoint: vi.fn(),
  };
}
const args = {
  identity,
  bridgeId: "bridge",
  connectUrl: "wss://gateway.example/connect",
  ticket: "secret",
  targetBaseUrl: "http://localhost:1234",
  model: "model",
};
beforeEach(() => vi.resetAllMocks());

test("starts only after native status subscription is installed", async () => {
  let installed: (off: () => void) => void = () => {
    throw new Error("listener missing");
  };
  native.listen.mockReturnValue(
    new Promise<() => void>((resolve) => {
      installed = resolve;
    }),
  );
  native.start.mockResolvedValue({ generation: 1, sessionExpiresAt: "later" });
  const ports = desktopBridgePorts(management());
  ports.native.subscribe(vi.fn());
  const pending = ports.native.start(args);
  await Promise.resolve();
  expect(native.start).not.toHaveBeenCalled();
  installed(vi.fn());
  await pending;
  expect(native.start).toHaveBeenCalledWith(args);
});

test("unsubscribes a listener installed after the controller was disposed", async () => {
  let installed: (off: () => void) => void = () => {
    throw new Error("listener missing");
  };
  native.listen.mockReturnValue(
    new Promise<() => void>((resolve) => {
      installed = resolve;
    }),
  );
  const off = desktopBridgePorts(management()).native.subscribe(vi.fn());
  off();
  const unlisten = vi.fn();
  installed(unlisten);
  await Promise.resolve();
  expect(unlisten).toHaveBeenCalledOnce();
});

test("rejects events from a different account or workspace", async () => {
  native.listen.mockResolvedValue(vi.fn());
  const listener = vi.fn();
  desktopBridgePorts(management()).native.subscribe(listener);
  const receive = native.listen.mock.calls[0]?.[1] as (value: {
    payload: LocalBridgeNativeEvent & { identity: typeof identity };
  }) => void;
  const event = {
    status: "online" as const,
    bridgeId: "bridge",
    generation: 1,
    identity,
  };
  receive({
    payload: { ...event, identity: { ...identity, userId: "other" } },
  });
  receive({ payload: { ...event, identity: { ...identity, orgId: "other" } } });
  receive({ payload: event });
  expect(listener).toHaveBeenCalledExactlyOnceWith(event);
});

test("binds native teardown and renewal to the original identity", async () => {
  const access = management();
  const ports = desktopBridgePorts(access);
  access.identity = { ...identity, userId: "new-user" };
  await ports.native.stop();
  await ports.native.renew("fresh-ticket");
  expect(native.stop).toHaveBeenCalledWith(identity);
  expect(native.renew).toHaveBeenCalledWith(identity, "fresh-ticket");
});

test("reports failed native subscriptions and refuses to start unobserved", async () => {
  const failure = new Error("listener unavailable");
  native.listen.mockRejectedValue(failure);
  const ports = desktopBridgePorts(management());
  ports.native.subscribe(vi.fn());
  await expect(ports.native.start(args)).rejects.toBe(failure);
  expect(native.report).toHaveBeenCalled();
  expect(native.start).not.toHaveBeenCalled();
});
