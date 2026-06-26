import type { Agent, AgentId } from "@houston/host/src/domain/types";
import {
  deploymentName,
  namespaceFor,
  pvcName,
  serviceBaseUrl,
  serviceName,
} from "@houston/host/src/launcher/names";
import type {
  CredentialVault,
  RuntimeEndpoint,
  RuntimeLauncher,
  RuntimeState,
} from "@houston/host/src/ports";
import { AppsV1Api, CoreV1Api, type KubeConfig } from "@kubernetes/client-node";
import {
  deleteIgnoringMissing,
  ensureDeployment,
  ensureNamespace,
  ensurePvc,
  ensureService,
  isStatus,
  scaleDeployment,
  waitForReady,
} from "./reconcile";

/**
 * Live GKE lifecycle for agent sandboxes. One Deployment + Service + PVC per
 * agent inside its workspace's namespace. Integration-noted: exercised against a
 * real apiserver, not unit-faked. The reconcile steps (./reconcile.ts) keep every
 * apiserver error surfacing except deliberate 404/409 idempotency control flow.
 */

/** Resolves the tenancy context the apiserver calls need from an agent id. */
export interface AgentResolver {
  /** The agent plus its workspace's DNS slug (namespaces are keyed by slug, not id). */
  resolve(agentId: AgentId): Promise<{ agent: Agent; workspaceSlug: string }>;
}

export interface GkeDeps {
  kubeConfig: KubeConfig;
  vault: CredentialVault;
  resolver: AgentResolver;
  /** Slug for the agent passed to ensureAwake (which already has the Agent). */
  workspaceSlugFor(agent: Agent): Promise<string>;
  /** Max time to wait for a Deployment to report a ready replica. */
  readyTimeoutMs?: number;
  /** Poll interval while waiting for readiness. */
  pollIntervalMs?: number;
}

export class GkeLauncher implements RuntimeLauncher {
  private readonly core: CoreV1Api;
  private readonly apps: AppsV1Api;
  private readonly readyTimeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(private readonly deps: GkeDeps) {
    this.core = deps.kubeConfig.makeApiClient(CoreV1Api);
    this.apps = deps.kubeConfig.makeApiClient(AppsV1Api);
    // Cold start on Autopilot = node scale-up + a ~120MB image pull + Bun boot,
    // which can exceed two minutes for the first-ever sandbox. Be generous.
    this.readyTimeoutMs = deps.readyTimeoutMs ?? 300_000;
    this.pollIntervalMs = deps.pollIntervalMs ?? 1_000;
  }

  async ensureAwake(agent: Agent): Promise<RuntimeEndpoint> {
    const workspaceSlug = await this.deps.workspaceSlugFor(agent);
    const ns = namespaceFor(workspaceSlug);
    const token = this.deps.vault.sandboxToken(agent.workspaceId, agent.id);

    await ensureNamespace(this.core, workspaceSlug);
    await ensurePvc(this.core, agent, workspaceSlug);
    await ensureDeployment(this.apps, agent, workspaceSlug, token);
    await ensureService(this.core, agent, workspaceSlug);
    await waitForReady(
      this.apps,
      ns,
      deploymentName(agent.id),
      this.readyTimeoutMs,
      this.pollIntervalMs,
    );

    return { baseUrl: serviceBaseUrl(agent, workspaceSlug), token };
  }

  async sleep(agentId: AgentId): Promise<void> {
    const { agent, workspaceSlug } = await this.deps.resolver.resolve(agentId);
    await scaleDeployment(
      this.apps,
      namespaceFor(workspaceSlug),
      deploymentName(agent.id),
      0,
    );
  }

  async destroy(
    agentId: AgentId,
    opts?: { dropVolume?: boolean },
  ): Promise<void> {
    const { agent, workspaceSlug } = await this.deps.resolver.resolve(agentId);
    const ns = namespaceFor(workspaceSlug);
    await deleteIgnoringMissing(() =>
      this.apps.deleteNamespacedDeployment(deploymentName(agent.id), ns),
    );
    await deleteIgnoringMissing(() =>
      this.core.deleteNamespacedService(serviceName(agent.id), ns),
    );
    if (opts?.dropVolume) {
      await deleteIgnoringMissing(() =>
        this.core.deleteNamespacedPersistentVolumeClaim(pvcName(agent.id), ns),
      );
    }
  }

  async status(agentId: AgentId): Promise<RuntimeState> {
    const { agent, workspaceSlug } = await this.deps.resolver.resolve(agentId);
    const ns = namespaceFor(workspaceSlug);
    try {
      const { body } = await this.apps.readNamespacedDeployment(
        deploymentName(agent.id),
        ns,
      );
      const desired = body.spec?.replicas ?? 0;
      const ready = body.status?.readyReplicas ?? 0;
      if (desired === 0) return "asleep";
      return ready > 0 ? "running" : "asleep";
    } catch (err) {
      if (isStatus(err, 404)) return "absent";
      throw err;
    }
  }
}
