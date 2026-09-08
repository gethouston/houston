import type { CustomEndpoint, LocalBridgeDescriptor } from "@houston/protocol";
import {
  type LocalBridgeJournal,
  LocalModelBridgeController,
  type LocalModelBridgePorts,
} from "@houston/sdk";
import { vi } from "vitest";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export const manual = { baseUrl: "https://manual.test/v1", model: "manual" };
export const detected = {
  server: {
    kind: "ollama" as const,
    baseUrl: "http://localhost:1234/v1",
    port: 1234,
    models: ["local"],
    reachable: true,
  },
  model: "local",
  name: "Local",
  appName: "Ollama",
};
export function integrationHarness() {
  const identity = {
    environment: "https://gateway.test",
    userId: "owner",
    orgId: "org",
    agentId: "agent",
  };
  let journal: LocalBridgeJournal | null = null;
  let endpoint: CustomEndpoint | null = null;
  let live: LocalBridgeDescriptor | null = null;
  let running = false;
  let generation = 0;
  const registrations = new Map<string, LocalBridgeDescriptor>();
  let expiresAt = new Date(Date.now() + 600_000).toISOString();
  const save = vi.fn(async (value: CustomEndpoint) => {
    if (!value.model) throw new Error("invalid endpoint");
    endpoint = structuredClone(value);
  });
  const clear = vi.fn(async () => {
    endpoint = null;
  });
  const ports: LocalModelBridgePorts = {
    management: {
      identity,
      register: vi.fn(async (request) => {
        const existing = registrations.get(request.idempotencyKey);
        if (existing) return existing;
        live = {
          bridgeId: crypto.randomUUID(),
          deviceId: request.deviceId,
          userId: identity.userId,
          orgId: identity.orgId,
          model: request.model,
          shared: false,
          revision: 1,
          baseUrl: "https://gateway.test/display",
        };
        registrations.set(request.idempotencyKey, live);
        return live;
      }),
      revoke: vi.fn(async () => {
        live = null;
      }),
      session: vi.fn(async (bridgeId, _device, _signal, renewedGeneration) => {
        expiresAt = new Date(Date.now() + 600_000).toISOString();
        return {
          bridgeId,
          connectUrl: `wss://gateway.test/v1/local-model-bridges/${bridgeId}/connect`,
          ticket: "test-ticket",
          ticketExpiresAt: expiresAt,
          sessionExpiresAt: expiresAt,
          generation: renewedGeneration ?? ++generation,
        };
      }),
      status: vi.fn(async () => {
        if (!live) throw new Error("missing bridge");
        return { ...live, status: "online" as const };
      }),
      legacyEndpoint: vi.fn(async () => null),
      saveEndpoint: vi.fn(async (value) => save(value)),
      clearEndpoint: vi.fn(async () => clear()),
    },
    storage: {
      load: vi.fn(async () => structuredClone(journal)),
      save: vi.fn(async (_identity, value) => {
        journal = structuredClone(value);
      }),
      clear: vi.fn(async () => {
        journal = null;
      }),
    },
    native: {
      device: vi.fn(async () => ({ deviceId: "device", deviceSecret: "test" })),
      start: vi.fn(async () => {
        running = true;
        return { generation, sessionExpiresAt: expiresAt };
      }),
      stop: vi.fn(async () => {
        running = false;
      }),
      renew: vi.fn(async () => {}),
      subscribe: () => () => {},
      legacyCandidate: vi.fn(async () => null),
      completeMigration: vi.fn(async () => {}),
    },
    report: vi.fn(),
    random: () => 0,
  };
  return {
    ports,
    save,
    clear,
    endpoint: () => endpoint,
    journal: () => journal,
    live: () => live,
    running: () => running,
    cascade: () => {
      live = null;
    },
    controller: () => new LocalModelBridgeController(ports),
  };
}
