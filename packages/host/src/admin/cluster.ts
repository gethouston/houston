import {
  CoreV1Api,
  type KubeConfig,
  type V1PersistentVolumeClaim,
  type V1Pod,
} from "@kubernetes/client-node";
import {
  AGENT_LABEL,
  MANAGED_BY_LABEL,
  MANAGED_BY_VALUE,
  WORKSPACE_LABEL,
} from "../launcher/names";
import { parseCpuToCores, parseMemToBytes } from "./quantity";

/**
 * A read-only, cross-namespace view of the agent sandboxes the control plane
 * manages — the raw material for the operator dashboard's "pods per user" and
 * live cost estimate. It is deliberately separate from RuntimeLauncher (which acts
 * on one agent at a time): the dashboard needs ONE cheap cluster-wide sweep, not
 * N per-agent reads. Selects strictly on the managed-by label so it can never see
 * or count anything the control plane didn't create.
 */

/** One agent pod as seen by the apiserver, tagged back to its tenancy from labels. */
export interface PodInfo {
  /** From the houston.ai/workspace label; null if the pod is missing the label. */
  workspaceId: string | null;
  /** From the houston.ai/agent label; null if the pod is missing the label. */
  agentId: string | null;
  namespace: string;
  podName: string;
  /** Raw Kubernetes phase: Pending | Running | Succeeded | Failed | Unknown. */
  phase: string;
  /** True only when phase is Running and every container reports ready. */
  ready: boolean;
  nodeName: string | null;
  /** ISO 8601, or null before the pod is scheduled. */
  startedAt: string | null;
  /** Sum of container restarts. */
  restarts: number;
  /** Σ container CPU requests, in cores (what Autopilot bills on). */
  cpuRequestCores: number;
  /** Σ container memory requests, in bytes. */
  memRequestBytes: number;
}

/** One agent PVC — the standing storage cost that persists while a sandbox sleeps. */
export interface VolumeInfo {
  workspaceId: string | null;
  agentId: string | null;
  namespace: string;
  pvcName: string;
  /** Requested storage in bytes (what the PD is billed at). */
  storageRequestBytes: number;
}

export interface ClusterSnapshot {
  pods: PodInfo[];
  volumes: VolumeInfo[];
}

export interface ClusterReader {
  /** Every Houston-managed agent pod + PVC across the cluster, in two apiserver calls. */
  snapshot(): Promise<ClusterSnapshot>;
}

const MANAGED_SELECTOR = `${MANAGED_BY_LABEL}=${MANAGED_BY_VALUE}`;

/** All-container ready AND Running — the condition under which an agent is reachable. */
function podReady(pod: V1Pod): boolean {
  if (pod.status?.phase !== "Running") return false;
  const statuses = pod.status?.containerStatuses;
  if (!statuses || statuses.length === 0) return false;
  return statuses.every((c) => c.ready === true);
}

function sumRestarts(pod: V1Pod): number {
  const statuses = pod.status?.containerStatuses ?? [];
  return statuses.reduce((acc, c) => acc + (c.restartCount ?? 0), 0);
}

function sumCpuRequestCores(pod: V1Pod): number {
  const containers = pod.spec?.containers ?? [];
  // In @kubernetes/client-node v0.22, requests is a plain { [k]: string } map.
  return containers.reduce(
    (acc, c) => acc + parseCpuToCores(c.resources?.requests?.cpu),
    0,
  );
}

function sumMemRequestBytes(pod: V1Pod): number {
  const containers = pod.spec?.containers ?? [];
  return containers.reduce(
    (acc, c) => acc + parseMemToBytes(c.resources?.requests?.memory),
    0,
  );
}

/** Map a raw V1Pod (already managed-by filtered) into our flat PodInfo. */
export function toPodInfo(pod: V1Pod): PodInfo {
  const labels = pod.metadata?.labels ?? {};
  const start = pod.status?.startTime;
  return {
    workspaceId: labels[WORKSPACE_LABEL] ?? null,
    agentId: labels[AGENT_LABEL] ?? null,
    namespace: pod.metadata?.namespace ?? "",
    podName: pod.metadata?.name ?? "",
    phase: pod.status?.phase ?? "Unknown",
    ready: podReady(pod),
    nodeName: pod.spec?.nodeName ?? null,
    // startTime deserializes to a Date in v0.22; normalise to ISO for the wire.
    startedAt: start ? new Date(start).toISOString() : null,
    restarts: sumRestarts(pod),
    cpuRequestCores: sumCpuRequestCores(pod),
    memRequestBytes: sumMemRequestBytes(pod),
  };
}

/** Map a raw V1PersistentVolumeClaim into our flat VolumeInfo. */
export function toVolumeInfo(pvc: V1PersistentVolumeClaim): VolumeInfo {
  const labels = pvc.metadata?.labels ?? {};
  // Prefer the bound capacity; fall back to the request (always present in our spec).
  const storage =
    pvc.status?.capacity?.storage ?? pvc.spec?.resources?.requests?.storage;
  return {
    workspaceId: labels[WORKSPACE_LABEL] ?? null,
    agentId: labels[AGENT_LABEL] ?? null,
    namespace: pvc.metadata?.namespace ?? "",
    pvcName: pvc.metadata?.name ?? "",
    storageRequestBytes: parseMemToBytes(storage),
  };
}

/**
 * Live GKE cluster reader. Two cluster-wide list calls, each constrained to the
 * managed-by label selector (4th positional arg in the v0.22 client; skipped args
 * are `undefined`, and the result is the `{ body }`-wrapped shape that version
 * returns). The control plane's ClusterRole already grants cluster-scoped
 * list on pods + persistentvolumeclaims, so no extra RBAC is needed.
 */
export class GkeClusterReader implements ClusterReader {
  private readonly core: CoreV1Api;

  constructor(kubeConfig: KubeConfig) {
    this.core = kubeConfig.makeApiClient(CoreV1Api);
  }

  async snapshot(): Promise<ClusterSnapshot> {
    const [pods, pvcs] = await Promise.all([
      this.core.listPodForAllNamespaces(
        undefined,
        undefined,
        undefined,
        MANAGED_SELECTOR,
      ),
      this.core.listPersistentVolumeClaimForAllNamespaces(
        undefined,
        undefined,
        undefined,
        MANAGED_SELECTOR,
      ),
    ]);
    return {
      pods: pods.body.items.map(toPodInfo),
      volumes: pvcs.body.items.map(toVolumeInfo),
    };
  }
}

/** In-memory ClusterReader for dev and tests — returns a fixed snapshot. */
export class FakeClusterReader implements ClusterReader {
  constructor(
    private readonly snap: ClusterSnapshot = { pods: [], volumes: [] },
  ) {}
  async snapshot(): Promise<ClusterSnapshot> {
    return this.snap;
  }
}
