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
import { FakeClusterReader, GkeClusterReader } from "./admin/cluster";
import { BigQueryBillingReader, type AutopilotRates } from "./admin/billing";
import type { CredentialStore, CredentialVault, SandboxManager, WorkspaceStore } from "./ports";
import type { Agent } from "./domain/types";
import type { TurnDeps } from "./turn/deps";
import { TurnRelay } from "./turn/relay";
import { TurnQuota } from "./turn/quota";
import { ConnectManager } from "./turn/connect";
import { MemoryTurnBus, type TurnBus } from "./turn/bus";
import { RedisTurnBus } from "./turn/bus-redis";
import { GcsObjectFiles, MemoryObjectFiles } from "./turn/objects";
import { makeIdTokenProvider } from "./turn/id-token";
import { refreshCredential } from "./credentials/refresh";
import { LinearFeedbackSender, type FeedbackSender } from "./feedback";
import { installGracefulShutdown } from "./shutdown";

/**
 * Boot the control plane: one frontend-facing API listener (auth + access +
 * routing/SSE + per-turn dispatch) on :CP_PORT. Credentials are connect-once
 * subscriptions (user's own OpenAI/Codex plan) served access-token-only —
 * there is no keyless proxy and no org API key.
 *
 * `dev` mode wires in-memory fakes (no Postgres, no cluster) so it boots and is
 * exercisable end-to-end with a single local runtime. Production swaps in the
 * Postgres store and the live GKE SandboxManager — same interfaces.
 */

/** Workspace store + the connect-once credential store, sharing one Pool in prod. */
function buildStores(): { store: WorkspaceStore; credentials: CredentialStore } {
  const runtime = { defaultRuntime: config.defaultRuntime };
  if (config.dev) {
    return { store: new MemoryWorkspaceStore(runtime), credentials: new MemoryCredentialStore() };
  }
  if (!config.databaseUrl) {
    throw new Error("CP_DATABASE_URL is required outside dev mode (CP_DEV=1)");
  }
  const pool = new Pool({ connectionString: config.databaseUrl });
  return { store: new PgWorkspaceStore(pool, runtime), credentials: new PgCredentialStore(pool) };
}

/** Per-turn Cloud Run dispatch wiring; undefined until CP_TURN_RUNTIME_URL is set. */
function buildTurn(credentials: CredentialStore): TurnDeps | undefined {
  if (!config.turnRuntimeUrl) return undefined;
  if (!config.dev && !config.gcsBucket) {
    throw new Error("CP_GCS_BUCKET is required when CP_TURN_RUNTIME_URL is set");
  }
  // The shared turn-state bus: Redis when CP_REDIS_URL is set (2+ replicas),
  // in-process otherwise (single replica — see cloud/k8s/control-plane.yaml).
  const bus: TurnBus = config.redisUrl ? new RedisTurnBus(config.redisUrl) : new MemoryTurnBus();
  return {
    runtimeUrl: config.turnRuntimeUrl,
    turnToken: config.turnToken,
    relay: new TurnRelay(bus),
    quota: new TurnQuota(
      { maxConcurrent: config.turnMaxConcurrent, perHour: config.turnsPerHour },
      { bus },
    ),
    objects: config.dev ? new MemoryObjectFiles() : new GcsObjectFiles(config.gcsBucket),
    credentials,
    connect: new ConnectManager(credentials, bus),
    refresh: refreshCredential,
    idToken: makeIdTokenProvider(config.turnRuntimeUrl),
    codexModels: config.codexModels,
  };
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

/** Web "Send feedback" → Linear; undefined until the Linear env is set. */
function buildFeedback(): FeedbackSender | undefined {
  if (!config.linearApiKey || !config.linearTeamId) return undefined;
  return new LinearFeedbackSender({
    apiKey: config.linearApiKey,
    teamId: config.linearTeamId,
    labelName: config.linearBugLabelName,
  });
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
    turn: buildTurn(credentials),
    feedback: buildFeedback(),
    corsOrigin: config.corsOrigin,
  };

  const server = createControlPlaneServer(deps);
  server.listen(config.port, config.host, () => {
    console.log(`[control-plane] API   http://${config.host}:${config.port}  (dev=${config.dev})`);
  });
  // Zero-downtime deploys: drain on SIGTERM so the RollingUpdate replacement
  // takes over without dropped requests (see shutdown.ts + k8s strategy).
  installGracefulShutdown(server);
}

main();
