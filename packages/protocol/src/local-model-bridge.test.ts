import { describe, expect, it } from "vitest";
import {
  LocalBridgeDescriptorSchema,
  LocalBridgeDeviceSchema,
  LocalBridgeRegisterSchema,
  LocalBridgeSessionSchema,
  ManagedBridgeEndpointSchema,
} from "./local-model-bridge";

const id = "8f37f69a-d233-44ef-bf06-e22a90809931";
const device = { deviceId: id, deviceSecret: "a".repeat(43) };
const descriptor = {
  bridgeId: id,
  deviceId: id,
  orgId: "org",
  userId: "user",
  model: "model",
  shared: false,
  revision: 1,
  baseUrl: "https://gateway.example/v1/local-model-bridges/bridge/v1",
};

describe("managed bridge trust boundaries", () => {
  it("requires an explicit version and UUID for managed endpoint transport", () => {
    expect(
      ManagedBridgeEndpointSchema.safeParse({ id, version: 1 }).success,
    ).toBe(true);
    for (const value of [
      { id },
      { id, version: 2 },
      { id: "../other", version: 1 },
      { id, version: 1, baseUrl: "https://attacker.example" },
    ]) {
      expect(ManagedBridgeEndpointSchema.safeParse(value).success).toBe(false);
    }
  });
  it("rejects device IDs without possession evidence and weak secrets", () => {
    expect(LocalBridgeDeviceSchema.safeParse(device).success).toBe(true);
    expect(LocalBridgeDeviceSchema.safeParse({ deviceId: id }).success).toBe(
      false,
    );
    expect(
      LocalBridgeDeviceSchema.safeParse({ ...device, deviceSecret: "short" })
        .success,
    ).toBe(false);
  });
  it("does not let registration select a different principal", () => {
    const value = {
      ...device,
      agentId: "agent",
      model: "model",
      idempotencyKey: id,
    };
    expect(LocalBridgeRegisterSchema.safeParse(value).success).toBe(true);
    expect(
      LocalBridgeRegisterSchema.safeParse({ ...value, userId: "another-user" })
        .success,
    ).toBe(false);
    expect(
      LocalBridgeRegisterSchema.safeParse({ ...value, orgId: "another-org" })
        .success,
    ).toBe(false);
  });
  it("rejects responses carrying secrets or unsafe revision numbers", () => {
    expect(LocalBridgeDescriptorSchema.safeParse(descriptor).success).toBe(
      true,
    );
    expect(
      LocalBridgeDescriptorSchema.safeParse({
        ...descriptor,
        deviceSecret: device.deviceSecret,
      }).success,
    ).toBe(false);
    expect(
      LocalBridgeDescriptorSchema.safeParse({
        ...descriptor,
        revision: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });
  it("requires bounded sessions with a parseable expiry", () => {
    const session = {
      bridgeId: id,
      connectUrl: `wss://gateway.example/v1/local-model-bridges/${id}/connect`,
      ticket: "scoped-ticket",
      ticketExpiresAt: "2026-09-07T00:01:00Z",
      sessionExpiresAt: "2026-09-07T00:10:00Z",
      generation: 1,
    };
    expect(LocalBridgeSessionSchema.safeParse(session).success).toBe(true);
    expect(
      LocalBridgeSessionSchema.safeParse({
        ...session,
        sessionExpiresAt: "never",
      }).success,
    ).toBe(false);
    expect(
      LocalBridgeSessionSchema.safeParse({ ...session, generation: -1 })
        .success,
    ).toBe(false);
  });
});
