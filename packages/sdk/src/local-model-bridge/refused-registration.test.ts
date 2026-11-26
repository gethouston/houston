import type { LocalBridgeDescriptor } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import { LocalModelBridgeController } from "./controller";
import type { LocalBridgeJournal, LocalModelBridgePorts } from "./types";

// HOUSTON-APP-5DY: the gateway refused a registration (403 bridge_forbidden:
// the agent's model ceiling, the person's role, the agent gone). The prepared
// journal survived the refusal, so every boot and every switch back to that
// agent re-registered it, met the same 403 and reported a loud bug, for weeks;
// and the retirement any later connect or disconnect runs first re-registered
// it too, so the agent's local model could never be changed.

const identity = {
  environment: "https://gateway.test",
  userId: "user",
  orgId: "org",
  agentId: "agent",
};
const input = { targetBaseUrl: "http://localhost:1234/v1", model: "denied" };
const forbidden = () =>
  Object.assign(new Error("bridge forbidden (engine error 403)"), {
    status: 403,
    body: { code: "bridge_forbidden", error: "bridge forbidden" },
  });
const wedged: LocalBridgeJournal = {
  version: 1,
  identity,
  idempotencyKey: "00000000-0000-4000-8000-0000000000aa",
  phase: "prepared",
  input,
};

function harness(saved: LocalBridgeJournal | null = null) {
  let journal = saved ? structuredClone(saved) : null;
  let live: LocalBridgeDescriptor | undefined;
  const expiry = new Date(Date.now() + 600_000).toISOString();
  const ports: LocalModelBridgePorts = {
    management: {
      identity,
      register: vi.fn(async (request) => {
        // The ceiling allows every model but "denied".
        if (request.model === "denied") throw forbidden();
        live = {
          bridgeId: "00000000-0000-4000-8000-000000000001",
          deviceId: request.deviceId,
          userId: identity.userId,
          orgId: identity.orgId,
          model: request.model,
          shared: false,
          revision: 1,
          baseUrl: "https://gateway.test/display",
        };
        return live;
      }),
      session: vi.fn(async (id) => ({
        bridgeId: id,
        connectUrl: `wss://gateway.test/v1/local-model-bridges/${id}/connect`,
        ticket: "ticket",
        ticketExpiresAt: expiry,
        sessionExpiresAt: expiry,
        generation: 1,
      })),
      status: vi.fn(async () => {
        if (!live) throw new Error("missing registration");
        return { ...live, status: "online" as const };
      }),
      revoke: vi.fn(async () => {
        live = undefined;
      }),
      legacyEndpoint: vi.fn(async () => null),
      clearEndpoint: vi.fn(async () => {}),
      saveEndpoint: vi.fn(async () => {}),
    },
    native: {
      device: vi.fn(async () => ({
        deviceId: "00000000-0000-4000-8000-000000000002",
        deviceSecret: "secret",
      })),
      start: vi.fn(async () => ({ generation: 1, sessionExpiresAt: expiry })),
      stop: vi.fn(async () => {}),
      renew: vi.fn(async () => {}),
      subscribe: () => () => {},
      legacyCandidate: vi.fn(async () => null),
      completeMigration: vi.fn(async () => {}),
    },
    storage: {
      load: vi.fn(async () => structuredClone(journal)),
      save: vi.fn(async (_id, value) => {
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
    live: () => live,
    journal: () => journal,
    controller: () => new LocalModelBridgeController(ports),
  };
}

test("a refused connect forgets the attempt, so the next boot neither registers nor reports", async () => {
  const h = harness();
  const controller = h.controller();
  await expect(controller.connect(input)).rejects.toMatchObject({
    status: 403,
    body: { code: "bridge_forbidden" },
  });
  expect(h.journal()).toBeNull();
  // Nothing is connected: the pill must not ask the person to sign in again.
  expect(controller.getSnapshot().status).toBe("disabled");
  expect(h.ports.report).toHaveBeenCalledWith(
    expect.objectContaining({ status: 403 }),
  );
  const reports = vi.mocked(h.ports.report).mock.calls.length;
  await controller.dispose();

  const restarted = h.controller();
  await restarted.resume();
  expect(h.ports.management.register).toHaveBeenCalledOnce();
  expect(h.ports.report).toHaveBeenCalledTimes(reports);
  expect(restarted.getSnapshot().status).toBe("disabled");
  await restarted.dispose();
});

test("a journal an earlier refusal left behind is forgotten by the next boot", async () => {
  const h = harness(wedged);
  const booted = h.controller();
  await expect(booted.resume()).rejects.toMatchObject({ status: 403 });
  expect(h.journal()).toBeNull();
  expect(booted.getSnapshot().status).toBe("disabled");
  const reports = vi.mocked(h.ports.report).mock.calls.length;
  await booted.dispose();

  const again = h.controller();
  await again.resume();
  expect(h.ports.management.register).toHaveBeenCalledOnce();
  expect(h.ports.report).toHaveBeenCalledTimes(reports);
  await again.dispose();
});

test("a refused journal no longer blocks connecting another model", async () => {
  const h = harness(wedged);
  const controller = h.controller();
  await expect(
    controller.connect({ ...input, model: "allowed" }),
  ).resolves.toBeUndefined();
  expect(h.live()?.model).toBe("allowed");
  expect(h.journal()?.phase).toBe("committed");
  expect(h.ports.management.revoke).not.toHaveBeenCalled();
  expect(h.ports.report).not.toHaveBeenCalled();
  await controller.dispose();
});

test("a refused journal no longer blocks disconnecting", async () => {
  const h = harness(wedged);
  const controller = h.controller();
  await expect(controller.disconnect()).resolves.toBeUndefined();
  expect(h.journal()).toBeNull();
  expect(h.ports.management.clearEndpoint).toHaveBeenCalledOnce();
  await controller.dispose();
});

test.each([
  ["a lost session", 401],
  ["an unreachable gateway", 503],
])(
  "%s at registration keeps the attempt for the next boot",
  async (_name, status) => {
    const h = harness(wedged);
    const failure = Object.assign(new Error("failed"), { status });
    vi.mocked(h.ports.management.register).mockRejectedValueOnce(failure);
    const controller = h.controller();
    await expect(controller.resume()).rejects.toBe(failure);
    expect(h.journal()).toEqual(wedged);
    await controller.dispose();
  },
);
