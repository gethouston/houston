import { isBridgeUnsupported } from "@houston/sdk";
import { afterEach, expect, test, vi } from "vitest";
import { AdapterContext } from "../src/engine-adapter/client/context";
import { localModelBridgeAccess } from "../src/engine-adapter/client/local-model-bridge";

const id = "a138ce01-cf5b-4d3d-b270-eecb9be1645d";
const device = { deviceId: id, deviceSecret: "a".repeat(43) };
const token = `x.${btoa(JSON.stringify({ sub: "owner" }))}.y`;
const caps = { profile: "cloud", localModelBridge: { versions: [1] } };
const session = {
  bridgeId: id,
  connectUrl: `wss://gateway.example/v1/local-model-bridges/${id}/connect`,
  ticket: "ephemeral-ticket",
  ticketExpiresAt: "2026-09-07T12:01:00Z",
  sessionExpiresAt: "2026-09-07T12:10:00Z",
  generation: 2,
};
function context(baseUrl = "https://gateway.example", controlPlane = true) {
  const ctx = new AdapterContext({ baseUrl, token, controlPlane });
  ctx.noteAgentList(["agent-a"]);
  return ctx;
}
function responses(...bodies: unknown[]) {
  const fetch = vi.fn();
  for (const body of bodies) fetch.mockResolvedValueOnce(Response.json(body));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

test("direct detection is limited to an explicitly local loopback engine", async () => {
  responses({ profile: "local", tunnel: false, multiplayer: false });
  await expect(
    localModelBridgeAccess(context("http://127.0.0.1:4318", false), "owner"),
  ).resolves.toBeNull();
});

test.each([
  ["https://remote.example", { profile: "local" }],
  ["http://127.0.0.1:4318", { profile: "cloud" }],
  ["http://localhost:4318", { profile: "local", multiplayer: true }],
  ["http://localhost:4318", { profile: "local", tunnel: true }],
])("refuses unsupported remote or hosted deployment %s", async (url, capabilities) => {
  responses(capabilities);
  const refusal = localModelBridgeAccess(context(url), "owner");
  await expect(refusal).rejects.toMatchObject({ status: 503 });
  // The SDK's discovery stops (no 30s poll) and the app files it as the quiet
  // bridge_unsupported class only if the thrown shape carries this code.
  await expect(refusal).rejects.toSatisfy(isBridgeUnsupported);
});

test("a capability outage does not downgrade to a direct connection", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 503 })),
  );
  await expect(
    localModelBridgeAccess(context("http://localhost:4318"), "owner"),
  ).rejects.toMatchObject({ status: 503 });
});

test("pins the account, workspace and agent and renews the same generation", async () => {
  const fetch = responses(caps, { id: "org-a" }, session);
  const access = await localModelBridgeAccess(context(), "owner");
  expect(access?.identity).toEqual({
    environment: "https://gateway.example",
    userId: "owner",
    orgId: "org-a",
    agentId: "agent-a",
  });
  await expect(access?.session(id, device, undefined, 2)).resolves.toEqual(
    session,
  );
  expect(JSON.parse(fetch.mock.calls[2]?.[1].body)).toEqual({
    ...device,
    generation: 2,
  });
});

test.each([
  `wss://attacker.example/v1/local-model-bridges/${id}/connect`,
  `wss://gateway.example/other`,
  `wss://gateway.example/v1/local-model-bridges/${id}/connect?ticket=secret`,
  `wss://user@gateway.example/v1/local-model-bridges/${id}/connect`,
  `ws://gateway.example/v1/local-model-bridges/${id}/connect`,
])("rejects a session ticket destination outside its exact trusted route: %s", async (connectUrl) => {
  responses(caps, { id: "org-a" }, { ...session, connectUrl });
  const access = await localModelBridgeAccess(context(), "owner");
  await expect(access?.session(id, device)).rejects.toThrow(
    "Invalid local model session destination",
  );
});

test("does not accept another workspace's status descriptor", async () => {
  responses(
    caps,
    { id: "org-a" },
    {
      bridgeId: id,
      deviceId: id,
      orgId: "org-b",
      userId: "owner",
      model: "model",
      shared: false,
      revision: 1,
      baseUrl: "https://gateway.example/model",
      status: "online",
    },
  );
  const access = await localModelBridgeAccess(context(), "owner");
  await expect(access?.status(id)).rejects.toThrow("identity mismatch");
});

test("disconnect cannot clear credentials in a workspace selected mid-operation", async () => {
  const ctx = context();
  const fetch = responses(caps, { id: "org-a" });
  const access = await localModelBridgeAccess(ctx, "owner");
  fetch.mockImplementationOnce(async () => {
    if (!ctx.cp) throw new Error("missing control plane");
    ctx.cp.activeOrgSlug = "other-workspace";
    return Response.json({});
  });
  await expect(access?.clearEndpoint()).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls[2]?.[0]).toContain("/credential/forget");
});

test("migration discovery rejects unexpected secret fields", async () => {
  responses(
    caps,
    { id: "org-a" },
    {
      baseUrl: "https://legacy.example/v1",
      model: "model",
      proxyKey: "must-not-leave-native-storage",
    },
  );
  const access = await localModelBridgeAccess(context(), "owner");
  await expect(access?.legacyEndpoint()).rejects.toThrow();
});
