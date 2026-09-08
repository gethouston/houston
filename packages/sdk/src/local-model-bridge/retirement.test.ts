import type {
  CustomEndpoint,
  LocalBridgeDescriptor,
  LocalBridgeRegister,
} from "@houston/protocol";
import { afterEach, expect, test, vi } from "vitest";
import { LocalModelBridgeController } from "./controller";
import type { LocalBridgeJournal, LocalModelBridgePorts } from "./types";

const identity = {
  environment: "https://gateway.test",
  userId: "user",
  orgId: "org",
  agentId: "agent",
};
const input = { targetBaseUrl: "http://localhost:1234/v1", model: "local" };
const manual = { baseUrl: "https://manual.test/v1", model: "manual" };
function harness() {
  const journals = new Map<string, LocalBridgeJournal>();
  const registrations = new Map<
    string,
    { descriptor: LocalBridgeDescriptor; request: LocalBridgeRegister }
  >();
  let live: LocalBridgeDescriptor | undefined;
  let endpoint: CustomEndpoint | null = manual;
  let generation = 0;
  const expiry = new Date(Date.now() + 600_000).toISOString();
  const register = vi.fn(async (request: LocalBridgeRegister) => {
    const saved = registrations.get(request.idempotencyKey);
    if (saved) {
      if (
        live?.bridgeId !== saved.descriptor.bridgeId ||
        JSON.stringify(request) !== JSON.stringify(saved.request)
      )
        throw Object.assign(new Error("bridge_conflict"), { status: 409 });
      return saved.descriptor;
    }
    if (live)
      throw Object.assign(new Error("bridge_conflict"), { status: 409 });
    live = {
      bridgeId: crypto.randomUUID(),
      deviceId: request.deviceId,
      userId: identity.userId,
      orgId: identity.orgId,
      model: request.model,
      shared: request.shared ?? false,
      revision: 1,
      baseUrl: "https://gateway.test/display",
    };
    registrations.set(request.idempotencyKey, {
      descriptor: live,
      request: structuredClone(request),
    });
    return live;
  });
  const revoke = vi.fn(async (id: string) => {
    if (live?.bridgeId === id) live = undefined;
  });
  const ports: LocalModelBridgePorts = {
    management: {
      identity,
      register,
      revoke,
      session: vi.fn(async (id) => ({
        bridgeId: id,
        connectUrl: `wss://gateway.test/v1/local-model-bridges/${id}/connect`,
        ticket: "ticket",
        ticketExpiresAt: expiry,
        sessionExpiresAt: expiry,
        generation: ++generation,
      })),
      status: vi.fn(async () => {
        if (!live) throw new Error("missing registration");
        return { ...live, status: "online" as const };
      }),
      legacyEndpoint: vi.fn(async () => endpoint),
      clearEndpoint: vi.fn(async () => {
        endpoint = null;
      }),
      saveEndpoint: vi.fn(async (value) => {
        endpoint = value;
      }),
    },
    native: {
      device: vi.fn(async () => ({
        deviceId: "00000000-0000-4000-8000-000000000002",
        deviceSecret: "test-secret",
      })),
      start: vi.fn(async () => ({ generation, sessionExpiresAt: expiry })),
      stop: vi.fn(async () => {}),
      renew: vi.fn(async () => {}),
      subscribe: () => () => {},
      legacyCandidate: vi.fn(async () => null),
      completeMigration: vi.fn(async () => {}),
    },
    storage: {
      load: vi.fn(async (id) =>
        structuredClone(journals.get(JSON.stringify(id)) ?? null),
      ),
      save: vi.fn(async (id, value) => {
        journals.set(JSON.stringify(id), structuredClone(value));
      }),
      clear: vi.fn(async (id) => {
        journals.delete(JSON.stringify(id));
      }),
    },
    report: vi.fn(),
    random: () => 0,
  };
  return {
    ports,
    register,
    revoke,
    live: () => live,
    endpoint: () => endpoint,
    replace: () => {
      endpoint = manual;
    },
    journal: () => journals.get(JSON.stringify(identity)),
    controller: () => new LocalModelBridgeController(ports),
  };
}
afterEach(() => vi.useRealTimers());

test("ordinary lost registration response disconnects before a fresh connect after restart", async () => {
  const h = harness();
  const controller = h.controller();
  const lost = new Error("registration response lost");
  h.ports.management.register = vi.fn(async (request) => {
    await h.register(request);
    throw lost;
  });
  await expect(controller.connect(input)).rejects.toBe(lost);
  expect(h.journal()?.phase).toBe("prepared");
  expect(h.journal()?.descriptor).toBeUndefined();
  const originalKey = h.journal()?.idempotencyKey;
  expect(h.live()).toBeDefined();
  h.ports.management.register = h.register;
  await controller.disconnect();
  expect(
    h.register.mock.calls.map(([request]) => request.idempotencyKey),
  ).toEqual([originalKey, originalKey]);
  expect(h.live()).toBeUndefined();
  await controller.dispose();
  const restarted = h.controller();
  try {
    await restarted.resume();
    expect(h.ports.native.start).not.toHaveBeenCalled();
    await expect(
      restarted.connect({ ...input, model: "fresh" }),
    ).resolves.toBeUndefined();
    expect(h.live()?.model).toBe("fresh");
    expect(h.journal()?.idempotencyKey).not.toBe(originalKey);
    expect(h.ports.management.revoke).toHaveBeenCalledOnce();
    expect(h.ports.report).toHaveBeenCalledWith(lost);
  } finally {
    await restarted.dispose();
  }
});

test("failed committed disconnect retries cleanup after restart without starting native", async () => {
  vi.useFakeTimers();
  const h = harness();
  const controller = h.controller();
  await controller.connect(input);
  const original = h.journal();
  const offline = new Error("offline");
  vi.mocked(h.ports.management.revoke).mockRejectedValueOnce(offline);
  const stops = vi.mocked(h.ports.native.stop).mock.calls.length;
  const disconnecting = controller.disconnect();
  expect(controller.getSnapshot().status).toBe("disabled");
  expect(h.ports.native.stop).toHaveBeenCalledTimes(stops + 1);
  await expect(disconnecting).rejects.toBe(offline);
  expect(h.journal()).toEqual({ ...original, phase: "disconnecting" });
  expect(h.ports.management.clearEndpoint).not.toHaveBeenCalled();
  await controller.dispose();
  const restarted = h.controller();
  const statuses: string[] = [];
  restarted.subscribe((snapshot) => statuses.push(snapshot.status));
  try {
    vi.mocked(h.ports.management.revoke).mockRejectedValueOnce(offline);
    await expect(restarted.resume()).rejects.toBe(offline);
    expect(h.journal()).toEqual({ ...original, phase: "disconnecting" });
    await vi.advanceTimersByTimeAsync(500);
    expect(h.ports.native.start).toHaveBeenCalledTimes(1);
    expect(h.ports.management.session).toHaveBeenCalledTimes(1);
    expect(h.ports.management.saveEndpoint).toHaveBeenCalledTimes(1);
    expect(new Set(statuses)).toEqual(new Set(["disabled"]));
    expect(h.ports.management.revoke).toHaveBeenLastCalledWith(
      original?.descriptor?.bridgeId,
      expect.any(AbortSignal),
    );
    expect(h.live()).toBeUndefined();
    expect(h.endpoint()).toBeNull();
    expect(h.journal()).toBeUndefined();
    expect(h.ports.report).toHaveBeenCalledWith(offline);
  } finally {
    await restarted.dispose();
  }
});

test.each([
  false,
  true,
])("manual replacement durably supersedes failed disconnect cleanup after restart: %s", async (restart) => {
  const h = harness();
  const controller = h.controller();
  await controller.connect(input);
  const original = h.journal();
  const offline = new Error("offline");
  vi.mocked(h.ports.management.revoke).mockRejectedValueOnce(offline);
  await expect(controller.disconnect()).rejects.toBe(offline);
  expect(h.journal()).toEqual({ ...original, phase: "disconnecting" });
  let replacing = controller;
  if (restart) {
    await controller.dispose();
    replacing = h.controller();
    vi.mocked(h.ports.management.revoke).mockRejectedValueOnce(offline);
    await expect(replacing.resume()).rejects.toBe(offline);
  }
  h.replace();
  vi.mocked(h.ports.management.revoke).mockRejectedValueOnce(offline);
  // The surface uses the snapshot journal to decide whether manual save needs retirement.
  if (replacing.getSnapshot().journal)
    await expect(replacing.retire()).rejects.toBe(offline);
  await replacing.dispose();
  expect(h.journal()).toEqual({ ...original, phase: "retiring" });
  const restarted = h.controller();
  try {
    await restarted.resume();
    expect(h.journal()).toBeUndefined();
    expect(h.live()).toBeUndefined();
    expect(h.endpoint()).toEqual(manual);
    expect(h.ports.management.clearEndpoint).not.toHaveBeenCalled();
    expect(h.ports.native.start).toHaveBeenCalledTimes(1);
    expect(h.ports.management.saveEndpoint).toHaveBeenCalledTimes(1);
  } finally {
    await restarted.dispose();
  }
});

test.each([
  "register",
  "revoke",
] as const)("ordinary lost registration response retains disconnect identity when %s fails", async (failure) => {
  const h = harness();
  const controller = h.controller();
  h.ports.management.register = vi.fn(async (request) => {
    await h.register(request);
    throw new Error("response lost");
  });
  await expect(controller.connect(input)).rejects.toThrow("response lost");
  const original = h.journal();
  const offline = new Error("offline");
  h.ports.management.register =
    failure === "register"
      ? vi.fn(async () => {
          throw offline;
        })
      : h.register;
  if (failure === "revoke")
    vi.mocked(h.ports.management.revoke).mockRejectedValueOnce(offline);
  await expect(controller.disconnect()).rejects.toBe(offline);
  expect(h.journal()).toMatchObject({ ...original, phase: "disconnecting" });
  expect(h.live()).toBeDefined();
  expect(h.ports.management.clearEndpoint).not.toHaveBeenCalled();
  await controller.dispose();
  h.ports.management.register = h.register;
  const restarted = h.controller();
  try {
    await restarted.resume();
    expect(h.live()).toBeUndefined();
    expect(h.journal()).toBeUndefined();
    expect(h.ports.native.start).not.toHaveBeenCalled();
    expect(
      h.register.mock.calls.every(
        ([request]) => request.idempotencyKey === original?.idempotencyKey,
      ),
    ).toBe(true);
    await restarted.connect({ ...input, model: "fresh" });
    expect(h.live()?.model).toBe("fresh");
  } finally {
    await restarted.dispose();
  }
});

test.each([
  "revoke response",
  "endpoint clear",
  "journal clear",
] as const)("disconnect cleanup survives restart after %s failure", async (failure) => {
  const h = harness();
  const controller = h.controller();
  await controller.connect(input);
  const offline = new Error("offline");
  if (failure === "revoke response")
    h.ports.management.revoke = vi.fn(async (id) => {
      await h.revoke(id);
      throw offline;
    });
  else if (failure === "endpoint clear")
    vi.mocked(h.ports.management.clearEndpoint).mockRejectedValueOnce(offline);
  else vi.mocked(h.ports.storage.clear).mockRejectedValueOnce(offline);
  await expect(controller.disconnect()).rejects.toBe(offline);
  expect(h.journal()?.phase).toBe("disconnecting");
  expect(h.journal()?.descriptor).toBeDefined();
  expect(h.live()).toBeUndefined();
  await controller.dispose();
  h.ports.management.revoke = h.revoke;
  const restarted = h.controller();
  try {
    await restarted.resume();
    expect(h.endpoint()).toBeNull();
    expect(h.journal()).toBeUndefined();
    expect(h.ports.native.start).toHaveBeenCalledTimes(1);
    expect(h.ports.management.saveEndpoint).toHaveBeenCalledTimes(1);
  } finally {
    await restarted.dispose();
  }
});

test("manual retirement interrupts an in-flight disconnect revoke before endpoint cleanup", async () => {
  const h = harness();
  const controller = h.controller();
  await controller.connect(input);
  let finish: (() => void) | undefined;
  vi.mocked(h.ports.management.revoke).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const disconnecting = controller.disconnect();
  const cancelled = expect(disconnecting).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(finish).toBeDefined());
  h.replace();
  const retiring = controller.retire();
  finish?.();
  await cancelled;
  await retiring;
  expect(h.endpoint()).toEqual(manual);
  expect(h.ports.management.clearEndpoint).not.toHaveBeenCalled();
  expect(h.journal()).toBeUndefined();
  expect(h.live()).toBeUndefined();
  expect(h.ports.report).not.toHaveBeenCalled();
  await controller.dispose();
});

test.each([
  "register",
  "revoke",
] as const)("cancelled lost registration response recovers across restarts despite failed %s", async (failure) => {
  vi.useFakeTimers();
  const h = harness();
  const controller = h.controller();
  const abort = new AbortController();
  const offline = new Error("offline");
  let first = true;
  h.ports.management.register = vi.fn(async (request, signal) => {
    if (!first && failure === "register") throw offline;
    first = false;
    const result = await h.register(request);
    abort.abort();
    signal?.throwIfAborted();
    return result;
  });
  h.ports.management.revoke = vi.fn(async () => {
    throw offline;
  });
  await expect(controller.connect(input, abort.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(h.live()).toBeDefined();
  expect(h.journal()?.phase).toBe("retiring");
  expect(controller.getSnapshot()).toEqual({
    status: "disabled",
    journal: null,
  });
  expect(h.ports.report).toHaveBeenCalledWith(offline);
  const originalKey = h.journal()?.idempotencyKey;
  await controller.dispose();

  h.ports.management.register = h.register;
  const restarted = h.controller();
  const statuses: string[] = [];
  restarted.subscribe((snapshot) => statuses.push(snapshot.status));
  await expect(restarted.resume()).rejects.toThrow("offline");
  await vi.advanceTimersByTimeAsync(500);
  expect(h.journal()?.idempotencyKey).toBe(originalKey);
  expect(h.ports.native.start).not.toHaveBeenCalled();
  expect(h.ports.management.session).not.toHaveBeenCalled();
  expect(h.ports.management.saveEndpoint).not.toHaveBeenCalled();
  expect(new Set(statuses)).toEqual(new Set(["disabled"]));
  await restarted.dispose();

  h.ports.management.revoke = h.revoke;
  const recovered = h.controller();
  await recovered.resume();
  expect(h.live()).toBeUndefined();
  expect(h.journal()).toBeUndefined();
  expect(
    h.register.mock.calls.every(
      ([request]) => request.idempotencyKey === originalKey,
    ),
  ).toBe(true);
  expect(h.endpoint()).toEqual(manual);
  await recovered.reconnect();
  expect(h.ports.native.start).not.toHaveBeenCalled();
  await recovered.connect({ ...input, model: "fresh" });
  expect(h.live()?.model).toBe("fresh");
  expect(h.journal()?.idempotencyKey).not.toBe(originalKey);
  await recovered.dispose();
});

test("failed retirement survives restart and never restores a manually replaced endpoint", async () => {
  const h = harness();
  const controller = h.controller();
  await controller.connect(input);
  const original = h.journal();
  h.replace();
  vi.mocked(h.ports.management.revoke).mockRejectedValueOnce(
    new Error("offline"),
  );
  await expect(controller.retire()).rejects.toThrow("offline");
  expect(h.journal()).toMatchObject({ ...original, phase: "retiring" });
  expect(controller.getSnapshot()).toEqual({
    status: "disabled",
    journal: null,
  });
  await controller.dispose();
  const restarted = h.controller();
  await restarted.resume();
  expect(h.live()).toBeUndefined();
  expect(h.journal()).toBeUndefined();
  expect(h.endpoint()).toEqual(manual);
  expect(h.ports.native.start).toHaveBeenCalledTimes(1);
  expect(h.ports.management.saveEndpoint).toHaveBeenCalledTimes(1);
  expect(h.ports.management.clearEndpoint).not.toHaveBeenCalled();
  await restarted.connect({ ...input, model: "fresh" });
  expect(h.live()?.model).toBe("fresh");
  await restarted.dispose();
});

test("next explicit connect cleans pending retirement before a fresh registration", async () => {
  const h = harness();
  const controller = h.controller();
  await controller.connect(input);
  h.replace();
  vi.mocked(h.ports.management.revoke).mockRejectedValueOnce(
    new Error("offline"),
  );
  await expect(controller.retire()).rejects.toThrow("offline");
  await controller.dispose();
  const restarted = h.controller();
  await restarted.connect({ ...input, model: "fresh" });
  expect(h.live()?.model).toBe("fresh");
  expect(h.ports.management.clearEndpoint).not.toHaveBeenCalled();
  await restarted.dispose();
});

test.each([
  "response",
  "clear",
] as const)("retirement recovers after revoke commits but %s fails", async (failure) => {
  const h = harness();
  const controller = h.controller();
  await controller.connect(input);
  h.replace();
  if (failure === "response")
    h.ports.management.revoke = vi.fn(async (id) => {
      await h.revoke(id);
      throw new Error("response lost");
    });
  else
    vi.mocked(h.ports.storage.clear).mockRejectedValueOnce(
      new Error("disk unavailable"),
    );
  await expect(controller.retire()).rejects.toThrow();
  expect(h.live()).toBeUndefined();
  expect(h.journal()?.phase).toBe("retiring");
  await controller.dispose();
  h.ports.management.revoke = h.revoke;
  const restarted = h.controller();
  await restarted.resume();
  expect(h.journal()).toBeUndefined();
  expect(h.endpoint()).toEqual(manual);
  expect(h.ports.native.start).toHaveBeenCalledTimes(1);
  expect(h.ports.management.saveEndpoint).toHaveBeenCalledTimes(1);
  await restarted.connect({ ...input, model: "fresh" });
  expect(h.live()?.model).toBe("fresh");
  await restarted.dispose();
});

test.each([
  "environment",
  "userId",
  "orgId",
  "agentId",
] as const)("retirement rejects a journal from another %s", async (field) => {
  const h = harness();
  const controller = h.controller();
  await controller.connect(input);
  await controller.stop();
  const saved = h.journal();
  if (!saved) throw new Error("missing journal");
  vi.mocked(h.ports.storage.load).mockResolvedValue({
    ...saved,
    phase: "retiring",
    identity: { ...identity, [field]: "foreign" },
  });
  for (const action of ["retire", "disconnect"] as const)
    await expect(controller[action]()).rejects.toThrow("identity mismatch");
  expect(h.ports.management.revoke).not.toHaveBeenCalled();
  expect(h.ports.storage.clear).not.toHaveBeenCalled();
  expect(h.live()?.bridgeId).toBe(saved.descriptor?.bridgeId);
  await controller.dispose();
});

test("disconnect cannot discard an ambiguous pending retirement or clear its replacement", async () => {
  const h = harness();
  const controller = h.controller();
  const abort = new AbortController();
  let first = true;
  h.ports.management.register = vi.fn(async (request, signal) => {
    if (!first) throw new Error("offline");
    first = false;
    const descriptor = await h.register(request);
    abort.abort();
    signal?.throwIfAborted();
    return descriptor;
  });
  await expect(controller.connect(input, abort.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(h.journal()?.descriptor).toBeUndefined();
  await controller.dispose();
  const restarted = h.controller();
  await expect(restarted.disconnect()).rejects.toThrow("offline");
  expect(h.journal()?.phase).toBe("retiring");
  expect(h.ports.management.clearEndpoint).not.toHaveBeenCalled();
  h.ports.management.register = h.register;
  await restarted.disconnect();
  expect(h.live()).toBeUndefined();
  expect(h.journal()).toBeUndefined();
  expect(h.endpoint()).toEqual(manual);
  await restarted.dispose();
});
