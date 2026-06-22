import { KubeConfig } from "@kubernetes/client-node";
import { Pool } from "pg";
import { type AutopilotRates, BigQueryBillingReader } from "./admin/billing";
import { FakeClusterReader, GkeClusterReader } from "./admin/cluster";
import { makeTokenVerifier } from "./auth/verify";
import { CLOUD_CAPABILITIES } from "./capabilities";
import { ProxyChannel } from "./channel/proxy";
import { TurnChannel } from "./channel/turn";
import { config } from "./config";
import { refreshCredential } from "./credentials/refresh";
import { MemoryCredentialStore, PgCredentialStore } from "./credentials/store";
import { EnvCredentialVault } from "./credentials/vault";
import type { Agent } from "./domain/types";
import { BusEventHub } from "./events/hub";
import { type FeedbackSender, LinearFeedbackSender } from "./feedback";
import { FakeLauncher } from "./launcher/fake";
import { type AgentResolver, GkeLauncher } from "./launcher/gke";
import { CloudPaths } from "./paths";
import type {
  CredentialStore,
  CredentialVault,
  RuntimeLauncher,
  WorkspaceStore,
} from "./ports";
import { forward } from "./proxy/route";
import { ChannelRoutineFirer } from "./schedule/firer";
import { Scheduler } from "./schedule/scheduler";
import {
  type AdminDeps,
  type ControlPlaneDeps,
  createControlPlaneServer,
} from "./server";
import { installGracefulShutdown } from "./shutdown";
import { MemoryWorkspaceStore } from "./store/memory";
import { PgWorkspaceStore } from "./store/pg";
import { MemoryTurnBus, type TurnBus } from "./turn/bus";
import { RedisTurnBus } from "./turn/bus-redis";
import { ConnectManager } from "./turn/connect";
import type { TurnDeps } from "./turn/deps";
import { makeIdTokenProvider } from "./turn/id-token";
import { TurnQuota } from "./turn/quota";
import { TurnRelay } from "./turn/relay";
import { GcsVfs, MemoryVfs, type Vfs } from "./vfs";

/**
 * Boot the control plane: one frontend-facing API listener (auth + access +
 * routing/SSE + per-turn dispatch) on :CP_PORT. Credentials are connect-once
 * subscriptions (user's own OpenAI/Codex plan) served access-token-only —
 * there is no keyless proxy and no org API key.
 *
 * `dev` mode wires in-memory fakes (no Postgres, no cluster) so it boots and is
 * exercisable end-to-end with a single local runtime. Production swaps in the
 * Postgres store and the live GKE RuntimeLauncher — same interfaces.
 */

/** Workspace store + the connect-once credential store, sharing one Pool in prod. */
function buildStores(): {
  store: WorkspaceStore;
  credentials: CredentialStore;
} {
  const runtime = { defaultRuntime: config.defaultRuntime };
  if (config.dev) {
    return {
      store: new MemoryWorkspaceStore(runtime),
      credentials: new MemoryCredentialStore(),
    };
  }
  if (!config.databaseUrl) {
    throw new Error("CP_DATABASE_URL is required outside dev mode (CP_DEV=1)");
  }
  const pool = new Pool({ connectionString: config.databaseUrl });
  return {
    store: new PgWorkspaceStore(pool, runtime),
    credentials: new PgCredentialStore(pool),
  };
}

/**
 * The one workspace Vfs for this deployment, shared by the typed .houston
 * data routes AND the per-turn dispatch. Undefined only on a legacy gke-only
 * deploy with no bucket (typed-data routes answer 503 there).
 */
function buildVfs(): Vfs | undefined {
  if (config.dev) return new MemoryVfs();
  return config.gcsBucket ? new GcsVfs(config.gcsBucket) : undefined;
}

/**
 * The shared turn-state bus, built once: Redis when CP_REDIS_URL is set (2+
 * replicas), in-process otherwise (single replica — see cloud/k8s). Shared by
 * the per-turn machinery AND the global event hub so one Redis connection backs
 * both — and so a domain-change emit on replica A reaches an SSE subscriber on B.
 */
function buildBus(): TurnBus {
  return config.redisUrl
    ? new RedisTurnBus(config.redisUrl)
    : new MemoryTurnBus();
}

/** Per-turn Cloud Run dispatch wiring; undefined until CP_TURN_RUNTIME_URL is set. */
function buildTurn(
  credentials: CredentialStore,
  vfs: Vfs | undefined,
  bus: TurnBus,
): TurnDeps | undefined {
  if (!config.turnRuntimeUrl) return undefined;
  if (!vfs) {
    throw new Error(
      "CP_GCS_BUCKET is required when CP_TURN_RUNTIME_URL is set",
    );
  }
  return {
    runtimeUrl: config.turnRuntimeUrl,
    turnToken: config.turnToken,
    relay: new TurnRelay(bus),
    quota: new TurnQuota(
      { maxConcurrent: config.turnMaxConcurrent, perHour: config.turnsPerHour },
      { bus },
    ),
    vfs,
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
): RuntimeLauncher {
  if (!config.agentImage) {
    throw new Error("CP_AGENT_IMAGE is required outside dev mode");
  }
  // Live GKE: the workspace slug (→ K8s namespace) is resolved from the store; the
  // per-sandbox token the runtime carries is minted by the vault.
  const workspaceSlugFor = async (agent: Agent): Promise<string> => {
    const ws = await store.getWorkspace(agent.workspaceId);
    if (!ws)
      throw new Error(
        `workspace ${agent.workspaceId} not found for agent ${agent.id}`,
      );
    return ws.slug;
  };
  const resolver: AgentResolver = {
    async resolve(agentId) {
      const agent = await store.getAgent(agentId);
      if (!agent) throw new Error(`agent ${agentId} not found`);
      return { agent, workspaceSlug: await workspaceSlugFor(agent) };
    },
  };
  return new GkeLauncher({ kubeConfig, vault, resolver, workspaceSlugFor });
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
    return {
      adminUserIds: config.adminUserIds,
      cluster: new FakeClusterReader(),
      billing: null,
      rates,
    };
  }
  // Guard with the actionable, env-named message BEFORE constructing the reader,
  // whose own constructor would otherwise throw a vaguer error first.
  if (config.billingBqTable && !config.gcpProject) {
    throw new Error(
      "CP_GCP_PROJECT is required when CP_BILLING_BQ_TABLE is set",
    );
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

  // One KubeConfig, shared by the launcher and the admin cluster reader. Null
  // in dev (everything runs against fakes).
  let kubeConfig: KubeConfig | null = null;
  if (!config.dev) {
    kubeConfig = new KubeConfig();
    kubeConfig.loadFromDefault(); // in-cluster service account, or local kubeconfig
  }

  if (!config.dev && !kubeConfig) {
    throw new Error("kubeConfig must be initialized before building sandboxes");
  }
  const launcher: RuntimeLauncher = config.dev
    ? new FakeLauncher()
    : buildSandboxes(store, vault, kubeConfig as KubeConfig);
  const vfs = buildVfs();
  const bus = buildBus();
  const turn = buildTurn(credentials, vfs, bus);
  const events = new BusEventHub(bus);
  const paths = new CloudPaths();

  // One channel per hosting model: gke workspaces proxy to standing pods,
  // cloudrun workspaces dispatch per-turn. A missing channel answers 503.
  const channels: ControlPlaneDeps["channels"] = {
    gke: new ProxyChannel({ launcher, proxy: { forward }, credentials }),
    ...(turn ? { cloudrun: new TurnChannel(turn) } : {}),
  };

  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials,
    vault,
    vfs,
    paths,
    events,
    channels,
    capabilities: CLOUD_CAPABILITIES,
    admin: buildAdmin(kubeConfig),
    feedback: buildFeedback(),
    corsOrigin: config.corsOrigin,
  };

  const server = createControlPlaneServer(deps);
  server.listen(config.port, config.host, () => {
    console.log(
      `[control-plane] API   http://${config.host}:${config.port}  (dev=${config.dev})`,
    );
  });
  // Zero-downtime deploys: drain on SIGTERM so the RollingUpdate replacement
  // takes over without dropped requests (see shutdown.ts + k8s strategy).
  installGracefulShutdown(server);

  // Routines: scan + fire on a cron. Needs the workspace vfs to read routines;
  // a gke-only deploy without a bucket has no typed data, so nothing to scan.
  // Every replica scans; the bus's setNx arbitrates so each run fires once.
  // The timer is unref'd, so it never blocks graceful shutdown.
  if (vfs) {
    const scheduler = new Scheduler({
      store,
      vfs,
      paths,
      lock: bus,
      firer: new ChannelRoutineFirer(channels),
      events,
    });
    scheduler.start();
    console.log("[control-plane] scheduler started");
  }
}

main();
