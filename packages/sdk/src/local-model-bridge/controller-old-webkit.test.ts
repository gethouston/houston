// macOS 10.15 and 11 are supported desktops whose system WebKit has no
// `AbortSignal.any` (Safari 17.4+): a connect with a caller signal must still
// compose that signal with the controller's lifetime instead of throwing.
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
const input = {
  targetBaseUrl: "http://localhost:1234/v1",
  model: "local",
  localApiKey: "private-key",
};
const nativeAny = AbortSignal.any;
afterEach(() => {
  AbortSignal.any = nativeAny;
});

test("connect with a caller signal works where AbortSignal.any is missing", async () => {
  Reflect.deleteProperty(AbortSignal, "any");
  const h = harness();
  await h.controller.connect(input, new AbortController().signal);
  expect(h.controller.getSnapshot().status).toBe("online");
  expect(h.ports.report).not.toHaveBeenCalled();
  await h.controller.dispose();
});

test("the caller's abort still cancels a connect where AbortSignal.any is missing", async () => {
  Reflect.deleteProperty(AbortSignal, "any");
  const h = harness();
  const caller = new AbortController();
  vi.mocked(h.ports.management.register).mockImplementation(async () => {
    caller.abort();
    return descriptor;
  });
  await expect(
    h.controller.connect(input, caller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(h.controller.getSnapshot().status).not.toBe("online");
  await h.controller.dispose();
});
