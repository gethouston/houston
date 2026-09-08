import type { LocalModelBridgeController } from "@houston/sdk";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonEngineError } from "../src/engine-adapter/client/errors";
import {
  deferred,
  detected,
  integrationHarness,
  manual,
} from "./local-model-integration-harness";

const mocks = vi.hoisted(() => ({
  controller: vi.fn(),
  snapshot: vi.fn(),
  save: vi.fn(),
  logout: vi.fn(),
  report: vi.fn(),
}));
vi.mock("../../../app/src/lib/identity/session-store", () => ({
  peekSession: async () => ({ uid: "owner" }),
}));
vi.mock("../../../app/src/lib/local-bridge-binding", () => ({
  localBridgeController: mocks.controller,
  localBridgeSnapshot: mocks.snapshot,
}));
vi.mock("../../../app/src/lib/local-bridge-ports", () => ({
  reportLocalBridgeError: mocks.report,
}));
vi.mock("../../../app/src/lib/os-bridge", () => ({
  osIsTauri: () => true,
  osDetectLocalModels: vi.fn(),
}));
vi.mock("../../../app/src/lib/tauri", () => ({
  tauriProvider: { setCustomEndpoint: mocks.save, launchLogout: mocks.logout },
}));

import {
  connectDetectedModel,
  connectManualEndpoint,
  disconnectLocalModel,
} from "../../../app/src/lib/local-model-connect";

let h: ReturnType<typeof integrationHarness>;
let controller: LocalModelBridgeController;
function bind() {
  controller = h.controller();
  mocks.controller.mockImplementation(async () => controller);
  mocks.snapshot.mockImplementation(controller.getSnapshot);
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  h = integrationHarness();
  bind();
  mocks.save.mockImplementation(h.save);
  mocks.logout.mockImplementation(h.clear);
});
afterEach(async () => {
  await controller.dispose();
  vi.useRealTimers();
});

test.each([
  "manual",
  "disconnect",
])("%s cancels connection before the first durable journal", async (action) => {
  const entered = deferred<void>();
  const gate = deferred<void>();
  const device = h.ports.native.device;
  h.ports.native.device = vi.fn(async (...args) => {
    entered.resolve();
    await gate.promise;
    return device(...args);
  });
  const connecting = connectDetectedModel(detected).catch(
    (error: unknown) => error,
  );
  await entered.promise;
  const replacing =
    action === "manual"
      ? connectManualEndpoint(manual)
      : disconnectLocalModel();
  await vi.advanceTimersByTimeAsync(0);
  gate.resolve();
  await Promise.all([connecting, replacing]);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(h.endpoint()).toEqual(action === "manual" ? manual : null);
  expect(h.journal()).toBeNull();
  expect(h.live()).toBeNull();
});

test("disconnect publishes durable phase while immediate native stop is still pending", async () => {
  await connectDetectedModel(detected);
  const gate = deferred<void>();
  const stop = vi.fn(() => gate.promise);
  h.ports.native.stop = stop;
  const disconnecting = controller.disconnect();
  expect(stop).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.journal()?.phase).toBe("disconnecting");
  expect(controller.getSnapshot().journal).toEqual(h.journal());
  gate.resolve();
  await disconnecting;
  expect(h.endpoint()).toBeNull();
  expect(controller.getSnapshot().journal).toBeNull();
});

test("snapshot follows every durable transaction phase before the next remote step", async () => {
  const phases: string[] = [];
  controller.subscribe((state) => {
    expect(state.journal).toEqual(h.journal());
    if (state.journal) phases.push(state.journal.phase);
  });
  const register = h.ports.management.register;
  h.ports.management.register = vi.fn(async (...args) => {
    expect(controller.getSnapshot().journal?.phase).toBe("prepared");
    return register(...args);
  });
  const start = h.ports.native.start;
  h.ports.native.start = vi.fn(async (...args) => {
    expect(controller.getSnapshot().journal?.phase).toBe("registered");
    return start(...args);
  });
  const save = h.ports.management.saveEndpoint;
  h.ports.management.saveEndpoint = vi.fn(async (...args) => {
    expect(controller.getSnapshot().journal?.phase).toBe("ready");
    return save(...args);
  });
  await connectDetectedModel(detected);
  expect(new Set(phases)).toEqual(
    new Set(["prepared", "registered", "ready", "committed"]),
  );
  await connectManualEndpoint(manual);
  expect(phases).toContain("retiring");
  expect(h.endpoint()).toEqual(manual);
});

test("failed journal persistence keeps the last durable snapshot through manual replacement", async () => {
  const save = h.ports.storage.save;
  h.ports.storage.save = vi.fn(async (identity, journal) => {
    if (journal.phase === "committed") throw new Error("disk unavailable");
    await save(identity, journal);
  });
  await expect(connectDetectedModel(detected)).rejects.toThrow(
    "disk unavailable",
  );
  expect(h.journal()?.phase).toBe("ready");
  expect(controller.getSnapshot().journal).toEqual(h.journal());
  await connectManualEndpoint(manual);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(h.endpoint()).toEqual(manual);
  expect(h.journal()).toBeNull();
});

test.each([
  "readiness",
  "registration",
])("manual replacement survives retry after initial %s failure", async (failure) => {
  if (failure === "readiness")
    vi.mocked(h.ports.native.start).mockRejectedValueOnce(new Error("offline"));
  else {
    const register = h.ports.management.register;
    vi.mocked(h.ports.management.register).mockImplementationOnce(
      async (...args) => {
        // Preserve the remote registration while losing its response.
        const result = await register(...args);
        expect(result).toBeDefined();
        throw new Error("offline");
      },
    );
  }
  await expect(connectDetectedModel(detected)).rejects.toThrow("offline");
  expect(controller.getSnapshot().journal).toEqual(h.journal());
  await connectManualEndpoint(manual);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(h.endpoint()).toEqual(manual);
  expect(h.journal()).toBeNull();
  expect(h.live()).toBeNull();
});

test("disconnect cleans an initial readiness failure through the app", async () => {
  vi.mocked(h.ports.native.start).mockRejectedValueOnce(new Error("offline"));
  await expect(connectDetectedModel(detected)).rejects.toThrow("offline");
  await disconnectLocalModel();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(h.endpoint()).toBeNull();
  expect(h.journal()).toBeNull();
  expect(h.live()).toBeNull();
});

test.each([
  "manual",
  "disconnect",
])("%s supersedes an initial in-flight registration", async (action) => {
  const gate = deferred<void>();
  const entered = deferred<void>();
  const register = h.ports.management.register;
  h.ports.management.register = vi.fn(async (...args) => {
    const result = await register(...args);
    entered.resolve();
    await gate.promise;
    return result;
  });
  const connecting = connectDetectedModel(detected).catch(
    (error: unknown) => error,
  );
  await entered.promise;
  const replacing =
    action === "manual"
      ? connectManualEndpoint(manual)
      : disconnectLocalModel();
  await vi.advanceTimersByTimeAsync(0);
  gate.resolve();
  await Promise.all([connecting, replacing]);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(h.endpoint()).toEqual(action === "manual" ? manual : null);
  expect(h.journal()).toBeNull();
  expect(h.live()).toBeNull();
});

test("manual replacement drains logout that has already reached the endpoint port", async () => {
  await connectDetectedModel(detected);
  const entered = deferred<void>();
  const gate = deferred<void>();
  h.ports.management.clearEndpoint = vi.fn(async () => {
    entered.resolve();
    await gate.promise;
    await h.clear();
  });
  const disconnecting = disconnectLocalModel().catch((error: unknown) => error);
  await entered.promise;
  const replacing = connectManualEndpoint(manual);
  await vi.advanceTimersByTimeAsync(0);
  gate.resolve();
  await Promise.all([disconnecting, replacing]);
  expect(h.endpoint()).toEqual(manual);
  expect(h.journal()).toBeNull();
});

test("manual replacement drains a retry whose bridge endpoint save completes late", async () => {
  vi.mocked(h.ports.native.start).mockRejectedValueOnce(new Error("offline"));
  await expect(connectDetectedModel(detected)).rejects.toThrow("offline");
  const entered = deferred<void>();
  const gate = deferred<void>();
  h.ports.management.saveEndpoint = vi.fn(async (value) => {
    entered.resolve();
    await gate.promise;
    await h.save(value);
  });
  await vi.advanceTimersByTimeAsync(500);
  await entered.promise;
  const replacing = connectManualEndpoint(manual);
  await vi.advanceTimersByTimeAsync(0);
  gate.resolve();
  await replacing;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(h.endpoint()).toEqual(manual);
  expect(h.journal()).toBeNull();
  expect(h.live()).toBeNull();
});

test("invalid manual configuration preserves the committed endpoint and native connection", async () => {
  await connectDetectedModel(detected);
  const original = h.endpoint();
  await expect(connectManualEndpoint({ ...manual, model: "" })).rejects.toThrow(
    "invalid endpoint",
  );
  expect(h.endpoint()).toEqual(original);
  expect(h.running()).toBe(true);
  expect(controller.getSnapshot().status).toBe("online");
  expect(h.journal()?.phase).toBe("committed");
  await vi.advanceTimersByTimeAsync(480_000);
  expect(h.running()).toBe(true);
  expect(controller.getSnapshot().status).toBe("online");
});

test.each([
  ["resume", "gateway"],
  ["connect", "gateway"],
  ["resume", "nested"],
  ["connect", "nested"],
])("confirmed remote absence permits retirement after restart via %s (%s)", async (action, shape) => {
  await connectDetectedModel(detected);
  vi.mocked(h.ports.management.revoke).mockRejectedValueOnce(
    new Error("offline"),
  );
  await expect(connectManualEndpoint(manual)).rejects.toThrow("offline");
  const old = h.journal()?.descriptor?.bridgeId;
  await controller.dispose();
  h.cascade();
  bind();
  vi.mocked(h.ports.management.revoke).mockRejectedValueOnce(
    new HoustonEngineError(
      404,
      shape === "gateway"
        ? { code: "bridge_not_found", error: "missing" }
        : { error: { code: "bridge_not_found", message: "missing" } },
    ),
  );
  if (action === "resume") {
    await controller.resume();
    expect(h.endpoint()).toEqual(manual);
    expect(h.journal()).toBeNull();
  }
  await connectDetectedModel(detected);
  expect(h.live()?.bridgeId).not.toBe(old);
  expect(h.journal()?.phase).toBe("committed");
  await disconnectLocalModel();
  expect(h.live()).toBeNull();
  expect(h.journal()).toBeNull();
  expect(h.endpoint()).toBeNull();
});

test.each([
  [404, "not_found", "nested"],
  [401, "bridge_not_found", "nested"],
  [403, "bridge_not_found", "nested"],
  [503, "bridge_not_found", "nested"],
  [404, undefined, "nested"],
  [404, "bridge_request_failed", "nested"],
  [404, "not_found", "gateway"],
  [401, "bridge_not_found", "gateway"],
  [403, "bridge_not_found", "gateway"],
  [503, "bridge_not_found", "gateway"],
  [404, undefined, "gateway"],
  [404, "bridge_request_failed", "gateway"],
] as const)("unconfirmed absence (%s/%s, %s) retains durable retirement", async (status, code, shape) => {
  await connectDetectedModel(detected);
  const failure = new HoustonEngineError(
    status,
    shape === "gateway"
      ? { code, error: "failed" }
      : code
        ? { error: { code, message: "failed" } }
        : null,
  );
  vi.mocked(h.ports.management.revoke).mockRejectedValue(failure);
  await expect(connectManualEndpoint(manual)).rejects.toBe(failure);
  await controller.dispose();
  bind();
  await expect(controller.resume()).rejects.toBe(failure);
  expect(h.journal()?.phase).toBe("retiring");
  expect(h.endpoint()).toEqual(manual);
  expect(h.ports.report).toHaveBeenCalledWith(failure);
});

test.each([
  "disconnect",
  "connect",
])("a later %s keeps its intent while a manual save completes", async (action) => {
  await connectDetectedModel(detected);
  const entered = deferred<void>();
  const gate = deferred<void>();
  mocks.save.mockImplementationOnce(async (value) => {
    entered.resolve();
    await gate.promise;
    await h.save(value);
  });
  const replacing = connectManualEndpoint(manual);
  await entered.promise;
  const later =
    action === "disconnect"
      ? disconnectLocalModel()
      : connectDetectedModel({ ...detected, model: "new-model" });
  const result = later.then(
    () => null,
    (error: unknown) => error,
  );
  await vi.advanceTimersByTimeAsync(0);
  gate.resolve();
  await replacing;
  expect(await result).toBeNull();
  if (action === "disconnect") {
    expect(h.endpoint()).toBeNull();
    expect(h.journal()).toBeNull();
  } else {
    expect(h.endpoint()?.model).toBe("new-model");
    expect(h.journal()?.phase).toBe("committed");
  }
});

test("disposing a scope cancels queued manual saves before they reach the provider", async () => {
  await connectDetectedModel(detected);
  const entered = deferred<void>();
  const gate = deferred<void>();
  mocks.save.mockImplementationOnce(async (value) => {
    entered.resolve();
    await gate.promise;
    await h.save(value);
  });
  const first = connectManualEndpoint(manual);
  await entered.promise;
  const replacement = { ...manual, model: "queued-replacement" };
  const second = connectManualEndpoint(replacement).catch(
    (error: unknown) => error,
  );
  await vi.advanceTimersByTimeAsync(0);
  const disposing = controller.dispose();
  gate.resolve();
  await first;
  await second;
  await disposing;
  expect(mocks.save).not.toHaveBeenCalledWith(replacement, "inline");
});
