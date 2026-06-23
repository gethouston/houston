import { expect, test } from "bun:test";
import type { CredentialVault, TokenVerifier } from "@houston/host/src/ports";
import {
  type ControlPlaneDeps,
  createControlPlaneServer,
} from "@houston/host/src/server";
import { MemoryWorkspaceStore } from "@houston/host/src/store/memory";
import type { Capabilities } from "@houston/protocol";
import type { AutopilotRates } from "../admin/billing";
import { FakeClusterReader } from "../admin/cluster";
import type { BillingReport, Overview } from "../admin/overview";
import { type AdminDeps, handleAdmin } from "./admin";

/**
 * The operator dashboard (`/admin/*`) end-to-end through the CLOSED admin surface,
 * injected into the OPEN host server via the `mountAdmin` seam — exactly how the
 * cloud entry point (`@houston/host-cloud` main.ts) wires it. The open server's
 * own server.test.ts only proves the seam is absent by default (`/admin/*` 404s);
 * the full 403/200/billing/405 behavior is here, where the closed `handleAdmin`
 * + `FakeClusterReader` + `AdminDeps` live.
 */

const verifier: TokenVerifier = {
  async verify(bearer) {
    return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
  },
};
const auth = (who: string) => ({ Authorization: `Bearer tok:${who}` });

const vault: CredentialVault = {
  sandboxToken(workspaceId) {
    return `sbx:${workspaceId}`;
  },
  validateSandboxToken(token) {
    return token.startsWith("sbx:")
      ? { workspaceId: token.slice(4), agentId: "a" }
      : null;
  },
};

const TEST_CAPABILITIES: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  integrations: [],
};

const RATES: AutopilotRates = {
  vcpuHourUsd: 0.0445,
  memGiBHourUsd: 0.0049,
  pdGiBMonthUsd: 0.1,
  clusterHourUsd: 0.1,
};

/**
 * Stand up the open server over a given store with the closed admin surface
 * injected exactly as the cloud entry point does: `mountAdmin` binds `handleAdmin`
 * over the admin deps + the workspace store.
 */
async function startAdminServer(
  store: MemoryWorkspaceStore,
  admin: AdminDeps,
): Promise<{ base: string; close: () => Promise<void> }> {
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: {
      async get() {
        return null;
      },
      async put() {},
      async remove() {},
    },
    vault,
    channels: {},
    capabilities: TEST_CAPABILITIES,
    mountAdmin: (userId, method, path, url, req, res) =>
      handleAdmin({ admin, store }, userId, method, path, url, req, res),
  };
  const s = createControlPlaneServer(deps);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  const addr = s.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  return { base, close: () => new Promise<void>((r) => s.close(() => r())) };
}

test("admin overview: a non-admin is 403; an admin sees every user's pods", async () => {
  // Seed alice (one agent) + bob, then build the cluster snapshot against the
  // freshly-minted ids — the same seed-before-cluster order the open test used.
  const store = new MemoryWorkspaceStore();
  const aliceWs = await store.getOrCreatePersonalWorkspace("alice");
  const sales = await store.createAgent({
    workspaceId: aliceWs.id,
    name: "SalesAgent",
  });
  await store.getOrCreatePersonalWorkspace("bob");

  const cluster = new FakeClusterReader({
    pods: [
      {
        workspaceId: aliceWs.id,
        agentId: sales.id,
        namespace: "ws-alice",
        podName: "agent-sales",
        phase: "Running",
        ready: true,
        nodeName: "gke-node-1",
        startedAt: "2026-06-08T00:00:00.000Z",
        restarts: 0,
        cpuRequestCores: 0.25,
        memRequestBytes: 512 * 1024 * 1024,
      },
    ],
    volumes: [],
  });
  const admin: AdminDeps = {
    adminUserIds: ["alice"],
    cluster,
    billing: null,
    rates: RATES,
  };
  const { base, close } = await startAdminServer(store, admin);
  try {
    expect(
      (await fetch(`${base}/admin/overview`, { headers: auth("bob") })).status,
    ).toBe(403);

    const r = await fetch(`${base}/admin/overview`, { headers: auth("alice") });
    expect(r.status).toBe(200);
    const ov = (await r.json()) as Overview;
    expect(ov.totals.pods.running).toBe(1);
    const aliceUser = ov.users.find((u) => u.userId === "alice");
    expect(
      aliceUser?.agents.some(
        (a) => a.agentId === sales.id && a.state === "running",
      ),
    ).toBe(true);
    // Bob shows up too (cross-tenant view), with no running pods.
    expect(ov.users.some((u) => u.userId === "bob")).toBe(true);
  } finally {
    await close();
  }
});

test("admin billing: estimate renders, actuals report 'not-configured' without BigQuery", async () => {
  const store = new MemoryWorkspaceStore();
  await store.getOrCreatePersonalWorkspace("alice");
  const admin: AdminDeps = {
    adminUserIds: ["alice"],
    cluster: new FakeClusterReader(),
    billing: null,
    rates: RATES,
  };
  const { base, close } = await startAdminServer(store, admin);
  try {
    const r = await fetch(`${base}/admin/billing`, { headers: auth("alice") });
    expect(r.status).toBe(200);
    const rep = (await r.json()) as BillingReport;
    expect(rep.actualsStatus).toBe("not-configured");
    expect(rep.actuals).toBeNull();
    expect(rep.estimate.byUser).toBeArray();
  } finally {
    await close();
  }
});

test("admin billing: ?days defaults to 30 when absent, and is honored when given", async () => {
  const store = new MemoryWorkspaceStore();
  await store.getOrCreatePersonalWorkspace("alice");
  const seen: number[] = [];
  const recordingBilling = {
    async query(days: number) {
      seen.push(days);
      return {
        source: "bigquery" as const,
        rangeDays: days,
        startDate: "2026-05-09",
        endDate: "2026-06-08",
        currency: "USD",
        totalUsd: 0,
        byNamespace: [],
      };
    },
  };
  const admin: AdminDeps = {
    adminUserIds: ["alice"],
    cluster: new FakeClusterReader(),
    billing: recordingBilling,
    rates: RATES,
  };
  const { base, close } = await startAdminServer(store, admin);
  try {
    await fetch(`${base}/admin/billing`, { headers: auth("alice") }); // no ?days
    await fetch(`${base}/admin/billing?days=7`, { headers: auth("alice") });
    expect(seen).toEqual([30, 7]);
  } finally {
    await close();
  }
});

test("admin routes reject non-GET with 405", async () => {
  const store = new MemoryWorkspaceStore();
  const admin: AdminDeps = {
    adminUserIds: ["alice"],
    cluster: new FakeClusterReader(),
    billing: null,
    rates: RATES,
  };
  const { base, close } = await startAdminServer(store, admin);
  try {
    const r = await fetch(`${base}/admin/overview`, {
      method: "POST",
      headers: auth("alice"),
    });
    expect(r.status).toBe(405);
  } finally {
    await close();
  }
});
