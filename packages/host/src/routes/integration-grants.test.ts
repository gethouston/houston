import type { Server } from "node:http";
import type { Capabilities } from "@houston/protocol";
import { expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import { EnvCredentialVault } from "../credentials/vault";
import { MemoryActionApprovalStore } from "../integrations/action-approval-store";
import { LocalActionApprovals } from "../integrations/action-approvals";
import { hashActionParams } from "../integrations/approvals";
import { FakeIntegrationProvider } from "../integrations/fake";
import { MemoryIntegrationGrantStore } from "../integrations/grant-store";
import { LocalIntegrationGrants } from "../integrations/grants";
import { IntegrationRegistry } from "../integrations/registry";
import type { TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";

/**
 * The LOCAL per-agent integration-grants surface end-to-end over real HTTP:
 * materialize-on-first-read defaults, replace-set validation, ownership, the
 * gateway-fronted profile NOT serving the routes, and the sandbox proxy's
 * search-filter / execute-403 enforcement once a record exists.
 */

const USER = "alice";
const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: ["composio"],
};

async function setup(
  opts: { withGrants?: boolean; withApprovals?: boolean } = {},
) {
  const withGrants = opts.withGrants ?? true;
  const verifier: TokenVerifier = {
    async verify(b) {
      return b === "tok" ? { userId: USER } : null;
    },
  };
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const vault = new EnvCredentialVault({ secret: "test-secret" });
  const fake = new FakeIntegrationProvider({ id: "composio" });
  const registry = new IntegrationRegistry([fake]);
  const grantStore = new MemoryIntegrationGrantStore();
  const approvalStore = new MemoryActionApprovalStore();
  const approvals = new LocalActionApprovals({ store: approvalStore });
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault,
    channels: {},
    capabilities: CAPS,
    integrations: { registry },
    integrationGrants: withGrants
      ? new LocalIntegrationGrants({ store: grantStore, registry })
      : undefined,
    actionApprovals: opts.withApprovals ? approvals : undefined,
    corsOrigin: "*",
  };
  const server: Server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const ws = await store.getOrCreatePersonalWorkspace(USER);
  const agent = await store.createAgent({
    workspaceId: ws.id,
    name: "Assistant",
  });
  return {
    base,
    ws,
    agent,
    vault,
    fake,
    grantStore,
    approvalStore,
    approvals,
    stop: () => server.close(),
  };
}

const auth = {
  Authorization: "Bearer tok",
  "Content-Type": "application/json",
};
const grantsUrl = (base: string, agentId: string) =>
  `${base}/v1/agents/${encodeURIComponent(agentId)}/integration-grants`;

test("GET materializes the connected-toolkits snapshot on first read and persists it", async () => {
  const { base, agent, fake, grantStore, stop } = await setup();
  try {
    // Two connections: an active gmail + an errored slack (both included); a
    // pending github is excluded from the materialized default.
    const c1 = await fake.connect(USER, "gmail");
    fake.completeConnection(USER, c1.connectionId);
    const c2 = await fake.connect(USER, "slack");
    fake.completeConnection(USER, c2.connectionId);
    await fake.connect(USER, "github"); // stays pending

    const errored = await fake.listConnections(USER);
    const slack = errored.find((c) => c.toolkit === "slack");
    if (slack) slack.status = "error";

    const res = await fetch(grantsUrl(base, agent.id), { headers: auth });
    expect(res.status).toBe(200);
    expect((await res.json()).toolkits.sort()).toEqual(["gmail", "slack"]);

    // The snapshot was persisted, not recomputed each read.
    expect(await grantStore.get(agent.id)).toEqual({
      stored: true,
      toolkits: ["gmail", "slack"],
    });
  } finally {
    stop();
  }
});

test("provider not ready → GET returns [] WITHOUT persisting (later signed-in read materializes)", async () => {
  const { base, agent, fake, grantStore, stop } = await setup();
  try {
    await fake.connect(USER, "gmail");
    fake.setNotReady();

    const res = await fetch(grantsUrl(base, agent.id), { headers: auth });
    expect(res.status).toBe(200);
    expect((await res.json()).toolkits).toEqual([]);
    expect(await grantStore.get(agent.id)).toEqual({ stored: false });
  } finally {
    stop();
  }
});

test("PUT replaces + dedupes; invalid bodies 400", async () => {
  const { base, agent, stop } = await setup();
  try {
    const put = (toolkits: unknown) =>
      fetch(grantsUrl(base, agent.id), {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({ toolkits }),
      });

    const ok = await put(["gmail", "gmail", "slack"]);
    expect(ok.status).toBe(200);
    expect((await ok.json()).toolkits).toEqual(["gmail", "slack"]);

    // A subsequent GET returns the stored set verbatim (no re-materialize).
    const get = await fetch(grantsUrl(base, agent.id), { headers: auth });
    expect((await get.json()).toolkits).toEqual(["gmail", "slack"]);

    expect((await put("gmail")).status).toBe(400); // not an array
    expect((await put([1, 2])).status).toBe(400); // not strings
    expect((await put(["Bad Slug"])).status).toBe(400); // bad charset
  } finally {
    stop();
  }
});

test("unknown agent → 404", async () => {
  const { base, ws, stop } = await setup();
  try {
    const res = await fetch(grantsUrl(base, `${ws.id}/Ghost`), {
      headers: auth,
    });
    expect(res.status).toBe(404);
  } finally {
    stop();
  }
});

test("gateway-fronted profile (no integrationGrants) does not serve the routes", async () => {
  const { base, agent, stop } = await setup({ withGrants: false });
  try {
    expect(
      (await fetch(grantsUrl(base, agent.id), { headers: auth })).status,
    ).toBe(404);
    expect(
      (
        await fetch(grantsUrl(base, agent.id), {
          method: "PUT",
          headers: auth,
          body: JSON.stringify({ toolkits: [] }),
        })
      ).status,
    ).toBe(404);
  } finally {
    stop();
  }
});

test("sandbox search filters connected-but-ungranted toolkits; not-connected discovery survives", async () => {
  const fake = new FakeIntegrationProvider({
    id: "composio",
    actions: [
      { action: "GMAIL_SEND_EMAIL", toolkit: "gmail", description: "email" },
      { action: "SLACK_POST", toolkit: "slack", description: "email" },
      // Never connected below — must SURVIVE the grant filter so the agent
      // can offer the in-chat connect card (HOU-670 discovery).
      { action: "NOTION_ADD", toolkit: "notion", description: "email notes" },
    ],
  });
  const { base, ws, agent, vault, grantStore, stop } = await setupWith(fake);
  try {
    // gmail + slack are CONNECTED; only gmail is granted to this agent.
    for (const toolkit of ["gmail", "slack"]) {
      const { connectionId } = await fake.connect(USER, toolkit);
      fake.completeConnection(USER, connectionId);
    }
    await grantStore.put(agent.id, ["gmail"]);
    const sb = vault.sandboxToken(ws.id, agent.id);
    const res = await fetch(`${base}/sandbox/integrations/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "email" }),
    });
    const items = (await res.json()).items as { action: string }[];
    expect(items.map((m) => m.action)).toEqual([
      "GMAIL_SEND_EMAIL",
      "NOTION_ADD",
    ]);
  } finally {
    stop();
  }
});

test("sandbox execute of an ungranted toolkit is 403 toolkit_not_granted", async () => {
  const { base, ws, agent, vault, grantStore, stop } = await setup();
  try {
    await grantStore.put(agent.id, ["gmail"]);
    const sb = vault.sandboxToken(ws.id, agent.id);
    const call = (action: string) =>
      fetch(`${base}/sandbox/integrations/execute`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sb}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, params: {} }),
      });

    const denied = await call("SLACK_POST_MESSAGE");
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe("toolkit_not_granted");

    const allowed = await call("GMAIL_SEND_EMAIL");
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).successful).toBe(true);
  } finally {
    stop();
  }
});

test("no stored record → sandbox execute/search pass through unfiltered", async () => {
  const { base, ws, agent, vault, stop } = await setup();
  try {
    const sb = vault.sandboxToken(ws.id, agent.id);
    const exec = await fetch(`${base}/sandbox/integrations/execute`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "SLACK_POST_MESSAGE", params: {} }),
    });
    expect(exec.status).toBe(200); // no record → not filtered
    expect((await exec.json()).successful).toBe(true);
  } finally {
    stop();
  }
});

// ── Action-approval gate (integrations-sandbox.ts) ──────────────────────────

/** POST an execute over the sandbox HMAC token, optionally in Autopilot. */
function execCall(
  base: string,
  sb: string,
  body: Record<string, unknown>,
  auto = false,
) {
  return fetch(`${base}/sandbox/integrations/execute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sb}`,
      "Content-Type": "application/json",
      ...(auto ? { "x-houston-turn-mode": "auto" } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("no approvals dep → execute runs untouched (existing installs unchanged)", async () => {
  const { base, ws, agent, vault, stop } = await setup(); // withApprovals off
  try {
    const sb = vault.sandboxToken(ws.id, agent.id);
    const res = await execCall(base, sb, {
      action: "GMAIL_SEND_EMAIL",
      params: { to: "x" },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).successful).toBe(true);
  } finally {
    stop();
  }
});

test("Autopilot turn (x-houston-turn-mode:auto) bypasses the gate", async () => {
  const { base, ws, agent, vault, stop } = await setup({ withApprovals: true });
  try {
    const sb = vault.sandboxToken(ws.id, agent.id);
    const res = await execCall(
      base,
      sb,
      { action: "GMAIL_SEND_EMAIL", params: { to: "x" } },
      true,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).successful).toBe(true);
  } finally {
    stop();
  }
});

test("an always-allow record lets the action run", async () => {
  const { base, ws, agent, vault, approvals, stop } = await setup({
    withApprovals: true,
  });
  try {
    await approvals.allowAlways(agent.id, "GMAIL_SEND_EMAIL");
    const sb = vault.sandboxToken(ws.id, agent.id);
    const res = await execCall(base, sb, {
      action: "GMAIL_SEND_EMAIL",
      params: { to: "x" },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).successful).toBe(true);
  } finally {
    stop();
  }
});

test("no ticket → 409 approval_required with the display payload + granted toolkit", async () => {
  const { base, ws, agent, vault, grantStore, stop } = await setup({
    withApprovals: true,
  });
  try {
    // A granted multi-word slug: toolkit resolution must pick the LONGEST match
    // (google_maps), not the segment before the first underscore (google).
    await grantStore.put(agent.id, ["google", "google_maps"]);
    const sb = vault.sandboxToken(ws.id, agent.id);
    const params = { origin: "A", destination: "B" };
    const res = await execCall(base, sb, {
      action: "GOOGLE_MAPS_GET_ROUTE",
      params,
    });
    expect(res.status).toBe(409);
    const payload = await res.json();
    expect(payload.code).toBe("approval_required");
    expect(payload.approval).toEqual({
      toolkit: "google_maps",
      action: "GOOGLE_MAPS_GET_ROUTE",
      params: { Origin: "A", Destination: "B" },
      paramsHash: hashActionParams("GOOGLE_MAPS_GET_ROUTE", params),
    });
  } finally {
    stop();
  }
});

test("no grant record → 409 resolves the multi-word toolkit from the user's connections", async () => {
  const { base, ws, agent, vault, fake, stop } = await setup({
    withApprovals: true,
    withGrants: false, // granted is null — the backward-compat path
  });
  try {
    // The user has a google_maps connection; the segment fallback would mislabel
    // GOOGLE_MAPS_GET_ROUTE as "google", so resolution must consult connections.
    const { connectionId } = await fake.connect(USER, "google_maps");
    fake.completeConnection(USER, connectionId);
    const sb = vault.sandboxToken(ws.id, agent.id);
    const res = await execCall(base, sb, {
      action: "GOOGLE_MAPS_GET_ROUTE",
      params: { origin: "A" },
    });
    expect(res.status).toBe(409);
    const payload = await res.json();
    expect(payload.approval.toolkit).toBe("google_maps");
  } finally {
    stop();
  }
});

test("a ticket runs once; an immediate identical re-execute 409s again", async () => {
  const { base, ws, agent, vault, approvals, stop } = await setup({
    withApprovals: true,
  });
  try {
    const params = { to: "x", subject: "hi" };
    const hash = hashActionParams("GMAIL_SEND_EMAIL", params);
    await approvals.addTicket(agent.id, hash);
    const sb = vault.sandboxToken(ws.id, agent.id);

    const first = await execCall(base, sb, {
      action: "GMAIL_SEND_EMAIL",
      params,
    });
    expect(first.status).toBe(200); // ticket consumed
    const second = await execCall(base, sb, {
      action: "GMAIL_SEND_EMAIL",
      params,
    });
    expect(second.status).toBe(409); // single use — re-ask
  } finally {
    stop();
  }
});

test("params drift → 409 despite a ticket for the old params", async () => {
  const { base, ws, agent, vault, approvals, stop } = await setup({
    withApprovals: true,
  });
  try {
    const hash = hashActionParams("GMAIL_SEND_EMAIL", { to: "x" });
    await approvals.addTicket(agent.id, hash);
    const sb = vault.sandboxToken(ws.id, agent.id);
    const res = await execCall(base, sb, {
      action: "GMAIL_SEND_EMAIL",
      params: { to: "y" }, // different params → different hash → no match
    });
    expect(res.status).toBe(409);
  } finally {
    stop();
  }
});

/** setup() variant that injects a custom provider (shared grant store). */
async function setupWith(fake: FakeIntegrationProvider) {
  const verifier: TokenVerifier = {
    async verify(b) {
      return b === "tok" ? { userId: USER } : null;
    },
  };
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const vault = new EnvCredentialVault({ secret: "test-secret" });
  const registry = new IntegrationRegistry([fake]);
  const grantStore = new MemoryIntegrationGrantStore();
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault,
    channels: {},
    capabilities: CAPS,
    integrations: { registry },
    integrationGrants: new LocalIntegrationGrants({
      store: grantStore,
      registry,
    }),
    corsOrigin: "*",
  };
  const server: Server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const ws = await store.getOrCreatePersonalWorkspace(USER);
  const agent = await store.createAgent({
    workspaceId: ws.id,
    name: "Assistant",
  });
  return {
    base,
    ws,
    agent,
    vault,
    fake,
    grantStore,
    stop: () => server.close(),
  };
}
