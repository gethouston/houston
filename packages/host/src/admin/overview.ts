import type { Agent, Workspace } from "../domain/types";
import { namespaceFor } from "../launcher/names";
import {
  type AutopilotRates,
  type BillingActuals,
  type CostRate,
  estimate,
  HOURS_PER_MONTH,
} from "./billing";
import type { ClusterSnapshot, PodInfo, VolumeInfo } from "./cluster";
import { bytesToGiB, bytesToMiB } from "./quantity";

/**
 * Joins the control plane's tenancy records (workspaces + agents, from the store)
 * with a live cluster snapshot (pods + PVCs, from the ClusterReader) into the two
 * shapes the operator dashboard renders: a per-user pod overview and a spend
 * report. Pure functions over already-fetched data, so they unit-test without a
 * cluster or a database.
 */

export type AgentState = "running" | "pending" | "asleep" | "absent";

export interface PodView {
  phase: string;
  ready: boolean;
  nodeName: string | null;
  startedAt: string | null;
  restarts: number;
  cpuRequestCores: number;
  memRequestMiB: number;
}

export interface AgentView {
  agentId: string;
  name: string;
  createdAt: number;
  state: AgentState;
  pod: PodView | null;
  /** Standing PVC size in GiB (0 if no volume yet). */
  storageGiB: number;
  cost: CostRate;
}

export interface UserView {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  slug: string;
  /** The K8s namespace holding this user's agent sandboxes. */
  namespace: string;
  createdAt: number;
  agents: AgentView[];
  runningAgents: number;
  cost: CostRate;
}

export interface OrphanView {
  /** Pods/volumes carrying our managed-by label but not matching any known agent. */
  pods: PodInfo[];
  volumes: VolumeInfo[];
  cost: CostRate;
}

export interface Overview {
  generatedAt: number;
  rates: AutopilotRates;
  totals: {
    users: number;
    agents: number;
    pods: { running: number; pending: number; other: number; total: number };
    /** Estimate across the WHOLE snapshot (includes orphans), so it reconciles. */
    cost: CostRate;
  };
  users: UserView[];
  orphans: OrphanView;
}

function group<T>(
  items: T[],
  keyOf: (t: T) => string | null,
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === null) continue;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function deriveState(pods: PodInfo[], hasVolume: boolean): AgentState {
  if (pods.some((p) => p.phase === "Running")) return "running";
  if (pods.some((p) => p.phase === "Pending")) return "pending";
  if (pods.length > 0) return "pending"; // a pod exists but isn't running/pending yet
  return hasVolume ? "asleep" : "absent";
}

function toPodView(pod: PodInfo): PodView {
  return {
    phase: pod.phase,
    ready: pod.ready,
    nodeName: pod.nodeName,
    startedAt: pod.startedAt,
    restarts: pod.restarts,
    cpuRequestCores: pod.cpuRequestCores,
    memRequestMiB: Math.round(bytesToMiB(pod.memRequestBytes)),
  };
}

export function buildOverview(
  workspaces: Workspace[],
  agents: Agent[],
  snapshot: ClusterSnapshot,
  rates: AutopilotRates,
  now: number,
): Overview {
  const podsByAgent = group(snapshot.pods, (p) => p.agentId);
  const volsByAgent = group(snapshot.volumes, (v) => v.agentId);
  const agentsByWorkspace = group(agents, (a) => a.workspaceId);
  const knownAgentIds = new Set(agents.map((a) => a.id));

  const users: UserView[] = workspaces
    .map((ws) => {
      const wsAgents = agentsByWorkspace.get(ws.id) ?? [];
      const agentViews: AgentView[] = wsAgents.map((agent) => {
        const pods = podsByAgent.get(agent.id) ?? [];
        const vols = volsByAgent.get(agent.id) ?? [];
        const representativePod =
          pods.find((p) => p.phase === "Running") ?? pods[0] ?? null;
        const storageBytes = vols.reduce(
          (acc, v) => acc + v.storageRequestBytes,
          0,
        );
        return {
          agentId: agent.id,
          name: agent.name,
          createdAt: agent.createdAt,
          state: deriveState(pods, vols.length > 0),
          pod: representativePod ? toPodView(representativePod) : null,
          storageGiB: Math.round(bytesToGiB(storageBytes) * 100) / 100,
          cost: estimate(pods, vols, rates),
        };
      });
      const allPods = wsAgents.flatMap((a) => podsByAgent.get(a.id) ?? []);
      const allVols = wsAgents.flatMap((a) => volsByAgent.get(a.id) ?? []);
      return {
        userId: ws.ownerUserId,
        workspaceId: ws.id,
        workspaceName: ws.name,
        slug: ws.slug,
        namespace: namespaceFor(ws.slug),
        createdAt: ws.createdAt,
        agents: agentViews,
        runningAgents: agentViews.filter((a) => a.state === "running").length,
        cost: estimate(allPods, allVols, rates),
      };
    })
    .sort((a, b) => b.cost.perMonthUsd - a.cost.perMonthUsd);

  const orphanPods = snapshot.pods.filter(
    (p) => p.agentId === null || !knownAgentIds.has(p.agentId),
  );
  const orphanVols = snapshot.volumes.filter(
    (v) => v.agentId === null || !knownAgentIds.has(v.agentId),
  );

  const podPhase = (phase: string) =>
    phase === "Running" ? "running" : phase === "Pending" ? "pending" : "other";
  const podCounts = {
    running: 0,
    pending: 0,
    other: 0,
    total: snapshot.pods.length,
  };
  for (const p of snapshot.pods) podCounts[podPhase(p.phase)] += 1;

  return {
    generatedAt: now,
    rates,
    totals: {
      users: workspaces.length,
      agents: agents.length,
      pods: podCounts,
      cost: estimate(snapshot.pods, snapshot.volumes, rates),
    },
    users,
    orphans: {
      pods: orphanPods,
      volumes: orphanVols,
      cost: estimate(orphanPods, orphanVols, rates),
    },
  };
}

export interface BillingUserLine {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  namespace: string;
  runningAgents: number;
  cost: CostRate;
  /** Authoritative billed net cost for this user's namespace over the window, if actuals exist. */
  actualUsd: number | null;
}

export type ActualsStatus = "ok" | "not-configured" | "error";

export interface BillingReport {
  generatedAt: number;
  currency: string;
  rates: AutopilotRates;
  estimate: {
    total: CostRate;
    /** Flat GKE cluster-management fee for the month (mostly offset by the free tier). */
    clusterFeeMonthUsd: number;
    byUser: BillingUserLine[];
  };
  actuals: BillingActuals | null;
  actualsStatus: ActualsStatus;
  actualsError?: string;
  note: string;
}

const ESTIMATE_NOTE =
  "Estimate uses GKE Autopilot list prices on live pod requests; it excludes committed-use/Spot discounts. Connect BigQuery billing export for authoritative billed dollars.";

export function buildBillingReport(
  overview: Overview,
  rates: AutopilotRates,
  actuals: BillingActuals | null,
  actualsStatus: ActualsStatus,
  actualsError: string | undefined,
  now: number,
): BillingReport {
  const actualByNs = new Map<string, number>();
  for (const n of actuals?.byNamespace ?? [])
    actualByNs.set(n.namespace, n.netCostUsd);

  const byUser: BillingUserLine[] = overview.users.map((u) => ({
    userId: u.userId,
    workspaceId: u.workspaceId,
    workspaceName: u.workspaceName,
    namespace: u.namespace,
    runningAgents: u.runningAgents,
    cost: u.cost,
    actualUsd: actuals ? (actualByNs.get(u.namespace) ?? 0) : null,
  }));

  return {
    generatedAt: now,
    currency: actuals?.currency ?? "USD",
    rates,
    estimate: {
      total: overview.totals.cost,
      clusterFeeMonthUsd:
        Math.round(rates.clusterHourUsd * HOURS_PER_MONTH * 100) / 100,
      byUser,
    },
    actuals,
    actualsStatus,
    actualsError,
    note: ESTIMATE_NOTE,
  };
}
