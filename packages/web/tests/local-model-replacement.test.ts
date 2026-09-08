import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  controller: vi.fn(),
  snapshot: vi.fn(),
  desktop: vi.fn(),
  retire: vi.fn(),
  stop: vi.fn(),
  disconnect: vi.fn(),
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
beforeEach(() => {
  vi.resetAllMocks();
  mocks.desktop.mockReturnValue(true);
  mocks.session.mockResolvedValue({ uid: "owner" });
  mocks.snapshot.mockReturnValue({ journal: null });
  mocks.controller.mockResolvedValue({
    retire: mocks.retire,
    stop: mocks.stop,
    disconnect: mocks.disconnect,
    getSnapshot: mocks.snapshot,
  });
});

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
  mocks.snapshot.mockReturnValue({ journal: {} });
  await disconnectLocalModel();
  expect(mocks.disconnect).toHaveBeenCalledOnce();
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
  mocks.snapshot.mockReturnValue({ journal: {} });
  mocks.retire.mockImplementation(async () => {
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith(endpoint, "inline");
  });
  await connectManualEndpoint(endpoint);
  expect(mocks.retire).toHaveBeenCalledOnce();
  expect(mocks.save).toHaveBeenCalledExactlyOnceWith(endpoint, "inline");
});

test("invalid manual settings preserve the working local bridge", async () => {
  mocks.snapshot.mockReturnValue({ journal: {} });
  const failure = new Error("invalid endpoint");
  mocks.save.mockRejectedValue(failure);
  await expect(connectManualEndpoint(endpoint)).rejects.toBe(failure);
  expect(mocks.retire).not.toHaveBeenCalled();
});

test("failed bridge retirement is reported to the caller", async () => {
  mocks.snapshot.mockReturnValue({ journal: {} });
  const failure = new Error("revocation unavailable");
  mocks.retire.mockRejectedValue(failure);
  await expect(connectManualEndpoint(endpoint)).rejects.toBe(failure);
  expect(mocks.report).toHaveBeenCalledWith(failure);
  expect(mocks.save).toHaveBeenCalledOnce();
});

test("manual replacement drains pending disconnect cleanup before saving", async () => {
  mocks.snapshot.mockReturnValue({ journal: { phase: "disconnecting" } });
  let cleanupDrained = false;
  mocks.stop.mockImplementation(async () => {
    cleanupDrained = true;
  });
  mocks.save.mockImplementation(async () => {
    expect(cleanupDrained).toBe(true);
  });
  await connectManualEndpoint(endpoint);
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.retire).toHaveBeenCalledOnce();
});
