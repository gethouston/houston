import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { integrationHarness } from "./local-model-integration-harness";

const mocks = vi.hoisted(() => ({
  controller: vi.fn(),
  snapshot: vi.fn(),
  desktop: vi.fn(),
  logout: vi.fn(),
  save: vi.fn(),
  report: vi.fn(),
  session: vi.fn(),
}));
vi.mock("../../../app/src/lib/identity/session-store", () => ({
  peekSession: mocks.session,
}));
vi.mock("../../../app/src/lib/local-bridge-binding", () => ({
  localBridgeController: mocks.controller,
  localBridgeSnapshot: mocks.snapshot,
}));
vi.mock("../../../app/src/lib/local-bridge-ports", () => ({
  reportLocalBridgeError: mocks.report,
}));
vi.mock("../../../app/src/lib/os-bridge", () => ({
  osIsTauri: mocks.desktop,
  osDetectLocalModels: vi.fn(),
}));
vi.mock("../../../app/src/lib/tauri", () => ({
  tauriProvider: { setCustomEndpoint: mocks.save, launchLogout: mocks.logout },
}));

import {
  connectManualEndpoint,
  disconnectLocalModel,
} from "../../../app/src/lib/local-model-connect";

const endpoint = { baseUrl: "https://model.example/v1", model: "model" };
let h: ReturnType<typeof integrationHarness>;
let bridge: ReturnType<ReturnType<typeof integrationHarness>["controller"]>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.desktop.mockReturnValue(true);
  mocks.session.mockResolvedValue({ uid: "owner" });
  h = integrationHarness();
  bridge = h.controller();
  mocks.snapshot.mockImplementation(bridge.getSnapshot);
  mocks.controller.mockResolvedValue(bridge);
  mocks.save.mockImplementation(h.save);
  mocks.logout.mockImplementation(h.clear);
});
afterEach(async () => bridge.dispose());

const connect = () =>
  bridge.connect({ targetBaseUrl: "http://localhost:1234/v1", model: "local" });

test.each([
  false,
  true,
])("ordinary endpoint disconnect does not require bridge capability (desktop=%s)", async (desktop) => {
  mocks.desktop.mockReturnValue(desktop);
  mocks.controller.mockRejectedValue(new Error("bridge_not_supported"));
  await disconnectLocalModel();
  expect(mocks.controller).not.toHaveBeenCalled();
  expect(mocks.logout).toHaveBeenCalledExactlyOnceWith("openai-compatible");
});

test("owned bridge disconnect uses SDK teardown", async () => {
  await connect();
  await disconnectLocalModel();
  expect(h.journal()).toBeNull();
  expect(h.endpoint()).toBeNull();
  expect(h.live()).toBeNull();
  expect(mocks.logout).not.toHaveBeenCalled();
});

test.each([
  false,
  true,
])("manual endpoints remain available without bridge discovery (desktop=%s)", async (desktop) => {
  mocks.desktop.mockReturnValue(desktop);
  await connectManualEndpoint(endpoint);
  expect(mocks.controller).not.toHaveBeenCalled();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(endpoint, "inline");
});

test("manual replacement retires the owned bridge after the new endpoint is accepted", async () => {
  await connect();
  const revoke = h.ports.management.revoke;
  h.ports.management.revoke = vi.fn(async (...args) => {
    expect(h.endpoint()).toEqual(endpoint);
    return revoke(...args);
  });
  await connectManualEndpoint(endpoint);
  expect(h.endpoint()).toEqual(endpoint);
  expect(h.journal()).toBeNull();
  expect(h.live()).toBeNull();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(endpoint, "inline");
});

test("invalid manual settings preserve the working local bridge", async () => {
  await connect();
  const original = h.endpoint();
  await expect(
    connectManualEndpoint({ ...endpoint, model: "" }),
  ).rejects.toThrow("invalid endpoint");
  expect(h.endpoint()).toEqual(original);
  expect(h.journal()?.phase).toBe("committed");
  expect(h.running()).toBe(true);
});

test("failed bridge retirement is reported to the caller and preserves the manual endpoint", async () => {
  await connect();
  const failure = new Error("revocation unavailable");
  vi.mocked(h.ports.management.revoke).mockRejectedValue(failure);
  await expect(connectManualEndpoint(endpoint)).rejects.toBe(failure);
  expect(mocks.report).toHaveBeenCalledWith(failure);
  expect(h.endpoint()).toEqual(endpoint);
  expect(h.journal()?.phase).toBe("retiring");
});
