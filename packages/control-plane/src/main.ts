import { KubeConfig } from "@kubernetes/client-node";
import { Pool } from "pg";
import { config } from "./config";
import {
  createControlPlaneServer,
  type AdminDeps,
  type ControlPlaneDeps,
  type SandboxRouter,
} from "./server";
import { makeTokenVerifier } from "./auth/verify";
import { MemoryWorkspaceStore } from "./store/memory";
import { PgWorkspaceStore } from "./store/pg";
import { MemoryCredentialStore, PgCredentialStore } from "./credentials/store";
import { FakeSandboxManager } from "./sandbox/fake";
import { GkeSandboxManager, type AgentResolver } from "./sandbox/gke";
import { EnvCredentialVault } from "./credentials/vault";
import { forward } from "./proxy/route";
import { createKeylessProxy } from "./proxy/credentials";
import { FakeClusterReader, GkeClusterReader } from "./admin/cluster";
import { BigQueryBillingReader, type AutopilotRates } from "./admin/billing";
import type { CredentialStore, CredentialVault, SandboxManager, WorkspaceStore } from "./ports";
import type { Agent } from "./domain/types";

/**
 * Boot the control plane. Two listeners:
 *   - the frontend-facing API (auth + access + routing/SSE)      :CP_PORT
 *   - the keyless credential proxy sandboxes call for AI         :CP_PROXY_PORT
 *
 * `dev` mode wires in-memory fakes (no Postgres, no cluster) so it boots and is
 * exercisable end-to-end with a single local runtime. Production swaps in the
 * Postgres store and the live GKE SandboxManager — same interfaces.
 */

/** Workspace store + the connect-once credential store, sharing one Pool in prod. */
function buildStores(): { store: WorkspaceStore; credentials: CredentialStore } {
  if (config.dev) {
    return { store: new MemoryWorkspaceStore(), credentials: new MemoryCredentialStore() };
  }
  if (!config.databaseUrl) {
    throw new Error("CP_DATABASE_URL is required outside dev mode (CP_DEV=1)");
  }
  const pool = new Pool({ connectionString: config.databaseUrl });
  return { store: new PgWorkspaceStore(pool), credentials: new PgCredentialStore(pool) };
}

function buildSandboxes(
  store: WorkspaceStore,
  vault: CredentialVault,
  kubeConfig: KubeConfig,
): SandboxManager {
  if (!config.agentImage) {
    throw new Error("CP_AGENT_IMAGE is required outside dev mode");
  }
  // Live GKE: the workspace slug (→ K8s namespace) is resolved from the store; the
  // per-sandbox token the runtime carries is minted by the vault.
  const workspaceSlugFor = async (agent: Agent): Promise<string> => {
    const ws = await store.getWorkspace(agent.workspaceId);
    if (!ws) throw new Error(`workspace ${agent.workspaceId} not found for agent ${agent.id}`);
    return ws.slug;
  };
  const resolver: AgentResolver = {
    async resolve(agentId) {
      const agent = await store.getAgent(agentId);
      if (!agent) throw new Error(`agent ${agentId} not found`);
      return { agent, workspaceSlug: await workspaceSlugFor(agent) };
    },
  };
  return new GkeSandboxManager({ kubeConfig, vault, resolver, workspaceSlugFor });
}

/** Operator-dashboard wiring: cluster reader + optional BigQuery actuals + rates. */
function buildAdmin(kubeConfig: KubeConfig | null): AdminDeps {
  const rates: AutopilotRates = {
    vcpuHourUsd: config.rateVcpuHourUsd,
    memGiBHourUsd: config.rateMemGiBHourUsd,
    pdGiBMonthUsd: config.ratePdGiBMonthUsd,
    clusterHourUsd: config.rateClusterHourUsd,
  };
  if (!kubeConfig) {
    // dev: no cluster, no billing export. The dashboard renders against fakes.
    return { adminUserIds: config.adminUserIds, cluster: new FakeClusterReader(), billing: null, rates };
  }
  // Guard with the actionable, env-named message BEFORE constructing the reader,
  // whose own constructor would otherwise throw a vaguer error first.
  if (config.billingBqTable && !config.gcpProject) {
    throw new Error("CP_GCP_PROJECT is required when CP_BILLING_BQ_TABLE is set");
  }
  const billing = config.billingBqTable
    ? new BigQueryBillingReader({
        project: config.gcpProject,
        table: config.billingBqTable,
        location: config.billingBqLocation,
      })
    : null;
  return {
    adminUserIds: config.adminUserIds,
    cluster: new GkeClusterReader(kubeConfig),
    billing,
    rates,
  };
}

function main(): void {
  const { store, credentials } = buildStores();
  const vault = new EnvCredentialVault();
  const verifier = makeTokenVerifier();

  // One KubeConfig, shared by the sandbox lifecycle manager and the admin cluster
  // reader. Null in dev (everything runs against fakes).
  let kubeConfig: KubeConfig | null = null;
  if (!config.dev) {
    kubeConfig = new KubeConfig();
    kubeConfig.loadFromDefault(); // in-cluster service account, or local kubeconfig
  }

  const sandboxes: SandboxManager = config.dev
    ? new FakeSandboxManager()
    : buildSandboxes(store, vault, kubeConfig!);
  const router: SandboxRouter = { forward };

  const deps: ControlPlaneDeps = {
    verifier,
    store,
    sandboxes,
    router,
    credentials,
    vault,
    admin: buildAdmin(kubeConfig),
    corsOrigin: config.corsOrigin,
  };

  createControlPlaneServer(deps).listen(config.port, config.host, () => {
    console.log(`[control-plane] API   http://${config.host}:${config.port}  (dev=${config.dev})`);
  });

  // The keyless proxy: sandboxes send AI calls here with only a control-plane-issued
  // token; the vault swaps in the workspace's real provider key. No real key ever
  // enters a sandbox.
  createKeylessProxy({
    upstream: config.proxyUpstream,
    provider: config.proxyProvider,
    vault,
  }).listen(config.proxyPort, config.host, () => {
    console.log(
      `[control-plane] proxy http://${config.host}:${config.proxyPort} -> ${config.proxyUpstream} (${config.proxyProvider})`,
    );
  });
}

main();
