import { afterEach, expect, test, vi } from "vitest";
import { LocalModelBridgeController } from "./controller";
import type {
  LocalBridgeJournal,
  LocalBridgeNativeEvent,
  LocalModelBridgePorts,
} from "./types";

const bridgeId = "00000000-0000-4000-8000-000000000001";
const identity = {
  environment: "https://gateway.test",
  userId: "user",
  orgId: "org",
  agentId: "agent",
};
const descriptor = {
  bridgeId,
  deviceId: "00000000-0000-4000-8000-000000000002",
  userId: "user",
  orgId: "org",
  model: "local",
  shared: false,
  revision: 1,
  baseUrl: "https://gateway.test/display",
};
function harness() {
  let journal: LocalBridgeJournal | null = null;
  let listener: (e: LocalBridgeNativeEvent) => void = () => {};
  let generation = 0;
  let expiry = new Date(Date.now() + 600_000).toISOString();
  const expires = () => expiry;
  const ports: LocalModelBridgePorts = {
    management: {
      identity,
      legacyEndpoint: vi.fn(async () => null),
      register: vi.fn(async () => descriptor),
      session: vi.fn(async (_id, _device, _signal, renewGeneration) => {
        expiry = new Date(Date.now() + 600_000).toISOString();
        return {
          bridgeId,
          connectUrl: `wss://gateway.test/v1/local-model-bridges/${bridgeId}/connect`,
          ticket: "ticket",
          ticketExpiresAt: expires(),
          sessionExpiresAt: expires(),
          generation: renewGeneration ?? ++generation,
        };
      }),
      status: vi.fn(async () => ({ ...descriptor, status: "online" as const })),
      saveEndpoint: vi.fn(async () => {}),
      clearEndpoint: vi.fn(async () => {}),
      revoke: vi.fn(async () => {}),
    },
    native: {
      legacyCandidate: vi.fn(async () => null),
      completeMigration: vi.fn(async () => {}),
      device: vi.fn(async () => ({
        deviceId: descriptor.deviceId,
        deviceSecret: "secret",
      })),
      start: vi.fn(async () => ({ generation, sessionExpiresAt: expires() })),
      renew: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
      subscribe: (cb) => {
        listener = cb;
        return () => {
          listener = () => {};
        };
      },
    },
    storage: {
      load: vi.fn(async () => journal),
      save: vi.fn(async (_identity, value) => {
        journal = structuredClone(value);
      }),
      clear: vi.fn(async () => {
        journal = null;
      }),
    },
    report: vi.fn(),
    random: () => 0,
  };
  return {
    ports,
    controller: new LocalModelBridgeController(ports),
    event: (event: LocalBridgeNativeEvent) => listener(event),
    journal: () => journal,
  };
}
afterEach(() => vi.useRealTimers());
const input = {
  targetBaseUrl: "http://localhost:1234/v1",
  model: "local",
  localApiKey: "private-key",
};

test("clean installation stays disabled and never retries", async () => {
  const h = harness();
  await h.controller.resume();
  expect(h.controller.getSnapshot().status).toBe("disabled");
  expect(h.ports.management.session).not.toHaveBeenCalled();
  expect(h.ports.report).not.toHaveBeenCalled();
});
test("connect commits a secret-free journal and explicit bridge descriptor", async () => {
  const h = harness();
  await h.controller.connect(input);
  expect(h.journal()?.phase).toBe("committed");
  expect(JSON.stringify(h.journal())).not.toContain("private-key");
  expect(h.ports.management.saveEndpoint).toHaveBeenCalledWith(
    expect.objectContaining({ bridge: { id: bridgeId, version: 1 } }),
    expect.any(AbortSignal),
  );
  expect(h.controller.getSnapshot()).toBe(h.controller.getSnapshot());
  await h.controller.dispose();
});
// The desktop webview's timers sleep while the app idles in the background
// (macOS App Nap): overnight, every session lapsed at the 10-minute mark and
// the late timer met a 409. The native side now says when a renewal is due.
test("a native renewal-due notice renews without the timer, once per session", async () => {
  vi.useFakeTimers();
  const h = harness();
  await h.controller.connect(input);
  const online = h.controller.getSnapshot();
  // A renewed session carries a later expiry; the fixture's expiry is minted
  // from the fake clock, so let it move before any renewal is issued.
  await vi.advanceTimersByTimeAsync(1_000);
  const renewals = () =>
    (h.ports.management.session as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[3] !== undefined,
    ).length;
  expect(renewals()).toBe(0);
  const notice = {
    bridgeId,
    generation: online.generation ?? 0,
    status: "online" as const,
    sessionExpiresAt: online.sessionExpiresAt,
    renewalDue: true,
  };
  h.event(notice);
  await vi.advanceTimersByTimeAsync(0);
  expect(renewals()).toBe(1);
  expect(h.ports.native.renew).toHaveBeenCalledTimes(1);
  expect(h.controller.getSnapshot().status).toBe("online");
  // The same notice again names the session already renewed: nothing happens.
  h.event(notice);
  await vi.advanceTimersByTimeAsync(0);
  expect(renewals()).toBe(1);
  // The timer for the renewed session still fires on its own schedule.
  await vi.advanceTimersByTimeAsync(480_000);
  expect(renewals()).toBe(2);
  expect(h.ports.report).not.toHaveBeenCalled();
  await h.controller.dispose();
});

test("failed renewal authorization stops all automatic retries", async () => {
  vi.useFakeTimers();
  const h = harness();
  await h.controller.connect(input);
  vi.mocked(h.ports.management.session).mockRejectedValueOnce({ status: 401 });
  await vi.advanceTimersByTimeAsync(480_000);
  expect(h.controller.getSnapshot().status).toBe("authorization_required");
  const calls = vi.mocked(h.ports.management.session).mock.calls.length;
  await vi.advanceTimersByTimeAsync(120_000);
  await h.controller.wake();
  expect(h.ports.management.session).toHaveBeenCalledTimes(calls);
  await h.controller.dispose();
});
test("disposed controller cannot revive a previous identity", async () => {
  const h = harness();
  await h.controller.connect(input);
  await h.controller.dispose();
  await expect(h.controller.connect(input)).rejects.toThrow("disposed");
  await expect(h.controller.resume()).rejects.toThrow("disposed");
  await expect(h.controller.reconnect()).rejects.toThrow("disposed");
  await expect(h.controller.wake()).rejects.toThrow("disposed");
  await expect(h.controller.disconnect()).rejects.toThrow("disposed");
});
test("late callbacks cannot change a newer generation", async () => {
  const h = harness();
  await h.controller.connect(input);
  const old = h.controller.getSnapshot().generation;
  await h.controller.reconnect();
  h.event({ bridgeId, generation: old ?? 0, status: "revoked" });
  expect(h.controller.getSnapshot().status).toBe("online");
  await h.controller.dispose();
});
test("local commit-write failure preserves remote endpoint for idempotent recovery", async () => {
  const h = harness();
  const save = h.ports.storage.save;
  h.ports.storage.save = vi.fn(async (id, journal) => {
    if (journal.phase === "committed") throw new Error("disk unavailable");
    await save(id, journal);
  });
  await expect(h.controller.connect(input)).rejects.toThrow("disk unavailable");
  expect(h.journal()?.phase).toBe("ready");
  expect(h.ports.management.revoke).not.toHaveBeenCalled();
  h.ports.storage.save = save;
  await h.controller.reconnect();
  expect(h.journal()?.phase).toBe("committed");
  await h.controller.dispose();
});
test("endpoint clear failure keeps disconnect journal for retry", async () => {
  const h = harness();
  await h.controller.connect(input);
  vi.mocked(h.ports.management.clearEndpoint).mockRejectedValueOnce(
    new Error("offline"),
  );
  await expect(h.controller.disconnect()).rejects.toThrow("offline");
  expect(h.journal()).not.toBeNull();
  await h.controller.disconnect();
  expect(h.journal()).toBeNull();
});

test("unmatched legacy state needs explicit reconnect and never registers", async () => {
  const h = harness();
  vi.mocked(h.ports.native.legacyCandidate).mockResolvedValue({
    targetBaseUrl: input.targetBaseUrl,
    proxyKey: "legacy-secret",
    appName: "Model App",
  });
  await h.controller.resume();
  expect(h.controller.getSnapshot().status).toBe("reconnect_required");
  expect(h.ports.management.register).not.toHaveBeenCalled();
  await h.controller.wake();
  expect(h.ports.management.register).not.toHaveBeenCalled();
  await h.controller.dispose();
});
test("migration preserves metadata, proves ownership, and marks only after commit", async () => {
  const h = harness();
  vi.mocked(h.ports.native.legacyCandidate).mockResolvedValue({
    targetBaseUrl: input.targetBaseUrl,
    proxyKey: "legacy-secret",
    localApiKey: "local-secret",
    appName: "Model App",
  });
  vi.mocked(h.ports.management.legacyEndpoint).mockResolvedValue({
    baseUrl: "https://legacy.example/v1",
    model: "local",
    name: "Original name",
    contextWindow: 32768,
    reasoning: true,
  });
  await h.controller.resume();
  expect(h.ports.management.register).toHaveBeenCalledWith(
    expect.objectContaining({
      legacy: {
        baseUrl: "https://legacy.example/v1",
        proxyKey: "legacy-secret",
      },
    }),
    expect.any(AbortSignal),
  );
  expect(h.journal()).toMatchObject({
    migration: true,
    phase: "committed",
    input: { name: "Original name", contextWindow: 32768, reasoning: true },
  });
  expect(JSON.stringify(h.journal())).not.toContain("secret");
  expect(h.ports.native.completeMigration).toHaveBeenCalledOnce();
  await h.controller.dispose();
});
test("explicit replacement revokes stale registration and commits the chosen metadata", async () => {
  const h = harness();
  await h.controller.connect(input);
  h.event({
    bridgeId,
    generation: h.controller.getSnapshot().generation ?? 0,
    status: "revoked",
  });
  await h.controller.connect({ ...input, name: "Replacement" });
  expect(h.ports.management.revoke).toHaveBeenCalledWith(
    bridgeId,
    expect.any(AbortSignal),
  );
  expect(h.journal()?.input.name).toBe("Replacement");
  expect(h.controller.getSnapshot().status).toBe("online");
  await h.controller.dispose();
});
test("aborted connect compensates registered bridge and never saves an endpoint", async () => {
  const h = harness();
  const abort = new AbortController();
  vi.mocked(h.ports.native.start).mockImplementationOnce(async () => {
    abort.abort();
    return {
      generation: 1,
      sessionExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    };
  });
  await expect(h.controller.connect(input, abort.signal)).rejects.toMatchObject(
    { name: "AbortError" },
  );
  expect(h.ports.management.revoke).toHaveBeenCalledWith(bridgeId);
  expect(h.ports.management.saveEndpoint).not.toHaveBeenCalled();
  expect(h.journal()).toBeNull();
  expect(h.controller.getSnapshot().status).toBe("disabled");
  await h.controller.dispose();
});
test("late callback from replaced bridge cannot match the current generation", async () => {
  const h = harness();
  await h.controller.connect(input);
  h.event({
    bridgeId: "00000000-0000-4000-8000-000000000099",
    generation: h.controller.getSnapshot().generation ?? 0,
    status: "revoked",
  });
  expect(h.controller.getSnapshot().status).toBe("online");
  await h.controller.dispose();
});

test("passive resume and healthy wake leave active inference connection intact", async () => {
  const h = harness();
  await h.controller.connect(input);
  const startCount = vi.mocked(h.ports.native.start).mock.calls.length;
  const stopCount = vi.mocked(h.ports.native.stop).mock.calls.length;
  await h.controller.resume();
  await h.controller.wake();
  expect(h.ports.native.start).toHaveBeenCalledTimes(startCount);
  expect(h.ports.native.stop).toHaveBeenCalledTimes(stopCount);
  await h.controller.dispose();
});

test("cancellation interrupts a pending native dial before waiting for its result", async () => {
  const h = harness();
  const abort = new AbortController();
  let rejectDial: ((error: unknown) => void) | undefined;
  vi.mocked(h.ports.native.start).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectDial = reject;
      }),
  );
  vi.mocked(h.ports.native.stop).mockImplementation(async () => {
    rejectDial?.(new DOMException("cancelled", "AbortError"));
  });
  const connecting = h.controller.connect(input, abort.signal);
  await vi.waitFor(() => expect(h.ports.native.start).toHaveBeenCalledOnce());
  await h.controller.wake();
  expect(h.ports.native.stop).toHaveBeenCalledTimes(1);
  abort.abort();
  expect(h.ports.native.stop).toHaveBeenCalledTimes(2);
  await expect(connecting).rejects.toMatchObject({ name: "AbortError" });
  expect(h.controller.getSnapshot().status).toBe("disabled");
  expect(h.ports.management.saveEndpoint).not.toHaveBeenCalled();
  await h.controller.dispose();
});

test.each([
  "reconnecting",
  "model_unavailable",
] as const)("native %s stays distinct in SDK status", async (status) => {
  const h = harness();
  await h.controller.connect(input);
  h.event({
    bridgeId,
    generation: h.controller.getSnapshot().generation ?? 0,
    status,
  });
  expect(h.controller.getSnapshot().status).toBe(status);
  await h.controller.dispose();
});

test.each([
  false,
  true,
])("retire preserves replacement and retains failed cleanup: %s", async (fails) => {
  const h = harness();
  await h.controller.connect(input);
  if (fails)
    vi.mocked(h.ports.management.revoke).mockRejectedValueOnce(
      new Error("offline"),
    );
  const retiring = h.controller.retire();
  if (fails) await expect(retiring).rejects.toThrow("offline");
  else await retiring;
  expect(h.ports.management.clearEndpoint).not.toHaveBeenCalled();
  if (fails) expect(h.journal()?.phase).toBe("retiring");
  else expect(h.journal()).toBeNull();
  expect(h.controller.getSnapshot()).toMatchObject({
    status: "disabled",
    journal: h.journal(),
  });
  await h.controller.dispose();
});
test("scope disposal rejects a pending explicit connection", async () => {
  const h = harness();
  let rejectDial: ((error: unknown) => void) | undefined;
  vi.mocked(h.ports.native.start).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectDial = reject;
      }),
  );
  vi.mocked(h.ports.native.stop).mockImplementation(async () => {
    rejectDial?.(new DOMException("cancelled", "AbortError"));
  });
  const connecting = h.controller.connect(input);
  const assertion = expect(connecting).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(h.ports.native.start).toHaveBeenCalledOnce());
  await h.controller.dispose();
  await assertion;
  expect(h.ports.management.saveEndpoint).not.toHaveBeenCalled();
  expect(h.ports.report).not.toHaveBeenCalled();
});
test.each([
  "busy",
  "model_unavailable",
] as const)("online wake leaves inference intact on %s", async (failure) => {
  const h = harness();
  await h.controller.connect(input);
  const stops = vi.mocked(h.ports.native.stop).mock.calls.length;
  if (failure === "busy")
    vi.mocked(h.ports.management.status).mockRejectedValueOnce({ status: 503 });
  else
    vi.mocked(h.ports.management.status).mockResolvedValueOnce({
      ...descriptor,
      status: "model_unavailable",
    });
  await h.controller.wake();
  expect(h.controller.getSnapshot().status).toBe("online");
  expect(h.ports.native.stop).toHaveBeenCalledTimes(stops);
  expect(h.ports.native.start).toHaveBeenCalledTimes(1);
  await h.controller.dispose();
});
test.each([
  "offline",
  "revoked",
  "authorization_required",
] as const)("wake handles confirmed %s", async (status) => {
  const h = harness();
  await h.controller.connect(input);
  if (status === "authorization_required")
    vi.mocked(h.ports.management.status).mockRejectedValueOnce({ status: 401 });
  else
    vi.mocked(h.ports.management.status).mockResolvedValueOnce({
      ...descriptor,
      status,
    });
  await h.controller.wake();
  expect(h.controller.getSnapshot().status).toBe(
    status === "offline" ? "online" : status,
  );
  expect(h.ports.native.start).toHaveBeenCalledTimes(
    status === "offline" ? 2 : 1,
  );
  await h.controller.dispose();
});
