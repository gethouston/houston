/**
 * Typed client for the control plane's operator endpoints (`/admin/*`). Plain
 * fetch with the admin's Supabase bearer — same origin as the rest of the app, so
 * nginx proxies `/api/admin/*` to the control plane (the `/api` prefix is stripped
 * there). Shapes mirror packages/host/src/admin/{overview,billing}.ts.
 */

export interface CostRate {
  perHourUsd: number;
  perMonthUsd: number;
}

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
  storageGiB: number;
  cost: CostRate;
}

export interface UserView {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  slug: string;
  namespace: string;
  createdAt: number;
  agents: AgentView[];
  runningAgents: number;
  cost: CostRate;
}

export interface Overview {
  generatedAt: number;
  totals: {
    users: number;
    agents: number;
    pods: { running: number; pending: number; other: number; total: number };
    cost: CostRate;
  };
  users: UserView[];
  orphans: {
    pods: {
      namespace: string;
      podName: string;
      agentId: string | null;
      phase: string;
    }[];
    volumes: { namespace: string; pvcName: string; agentId: string | null }[];
    cost: CostRate;
  };
}

export interface BillingActuals {
  source: "bigquery";
  rangeDays: number;
  startDate: string;
  endDate: string;
  currency: string;
  totalUsd: number;
  byNamespace: { namespace: string; netCostUsd: number }[];
}

export interface BillingReport {
  generatedAt: number;
  currency: string;
  estimate: {
    total: CostRate;
    clusterFeeMonthUsd: number;
    byUser: {
      userId: string;
      workspaceName: string;
      namespace: string;
      runningAgents: number;
      cost: CostRate;
      actualUsd: number | null;
    }[];
  };
  actuals: BillingActuals | null;
  actualsStatus: "ok" | "not-configured" | "error";
  actualsError?: string;
  note: string;
}

async function getJson<T>(
  controlPlaneUrl: string,
  path: string,
  token: string,
): Promise<T> {
  const res = await fetch(`${controlPlaneUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 403) {
    throw new Error(
      "This account is not an operator. Ask to be added to CP_ADMIN_USER_IDS.",
    );
  }
  if (res.status === 404) {
    throw new Error(
      "The operator dashboard is not enabled on this control plane (CP_ADMIN_USER_IDS is empty).",
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Request failed (${res.status}): ${detail || res.statusText}`,
    );
  }
  return (await res.json()) as T;
}

export function fetchOverview(
  controlPlaneUrl: string,
  token: string,
): Promise<Overview> {
  return getJson<Overview>(controlPlaneUrl, "/admin/overview", token);
}

export function fetchBilling(
  controlPlaneUrl: string,
  token: string,
  days: number,
): Promise<BillingReport> {
  return getJson<BillingReport>(
    controlPlaneUrl,
    `/admin/billing?days=${days}`,
    token,
  );
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
export function usd(n: number): string {
  return USD.format(n);
}
