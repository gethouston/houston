import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { WorkspaceStore } from "../ports";
import type { ClusterReader } from "../admin/cluster";
import type { AutopilotRates, BillingActualsReader } from "../admin/billing";
import { buildBillingReport, buildOverview, type ActualsStatus } from "../admin/overview";
import { json, readJson } from "./http";

/**
 * Wiring for the operator dashboard (`/admin/*`). Absent → the admin API does
 * not exist (404). Present but `adminUserIds` empty → still off (never falls open).
 */
export interface AdminDeps {
  /** Supabase user ids (JWT `sub`) allowed to read the cross-tenant views. */
  adminUserIds: string[];
  /** Cluster-wide read of managed agent pods + PVCs. */
  cluster: ClusterReader;
  /** Authoritative billed cost; null when BigQuery export isn't configured. */
  billing: BillingActualsReader | null;
  /** USD rates the live cost estimate multiplies against. */
  rates: AutopilotRates;
}

/** Parse the ?days= window for the billing view: default 30, clamped to [1, 180]. */
function billingDays(raw: string | null): number {
  if (raw === null || raw.trim() === "") return 30; // Number(null/"") is 0 — guard the absent case.
  const n = Number(raw);
  if (!Number.isFinite(n)) return 30;
  return Math.min(180, Math.max(1, Math.floor(n)));
}

/**
 * Operator routes (cross-tenant: every user's pods + spend + the gke↔cloudrun
 * migration flip). Gated by an explicit user-id allowlist. Returns true when
 * the request was handled.
 */
export async function handleAdmin(
  deps: { admin?: AdminDeps; store: WorkspaceStore },
  userId: UserId,
  method: string,
  path: string,
  url: URL,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const adminRuntime = path.match(/^\/admin\/workspaces\/([^/]+)\/runtime$/);
  const isAdminPath = adminRuntime !== null || path === "/admin/overview" || path === "/admin/billing";
  if (!isAdminPath) return false;

  const admin = deps.admin;
  if (!admin || admin.adminUserIds.length === 0) {
    json(res, 404, { error: "not found" });
    return true;
  }
  if (!admin.adminUserIds.includes(userId)) {
    json(res, 403, { error: "forbidden" });
    return true;
  }

  // Migration control: flip one workspace between gke and cloudrun hosting.
  if (adminRuntime && method === "POST") {
    const wsId = adminRuntime[1];
    const { runtime } = await readJson(req);
    if (runtime !== "gke" && runtime !== "cloudrun") {
      json(res, 400, { error: "runtime must be 'gke' or 'cloudrun'" });
      return true;
    }
    if (!wsId) {
      json(res, 404, { error: "not found" });
      return true;
    }
    json(res, 200, await deps.store.setWorkspaceRuntime(wsId, runtime));
    return true;
  }
  if (adminRuntime) {
    json(res, 405, { error: "method not allowed" });
    return true;
  }

  if (method !== "GET") {
    json(res, 405, { error: "method not allowed" });
    return true;
  }

  const [workspaces, agents, snapshot] = await Promise.all([
    deps.store.listWorkspaces(),
    deps.store.listAllAgents(),
    admin.cluster.snapshot(),
  ]);
  const now = Date.now();
  const overview = buildOverview(workspaces, agents, snapshot, admin.rates, now);

  if (path === "/admin/overview") {
    json(res, 200, overview);
    return true;
  }

  // /admin/billing — overview's per-user estimate, plus BigQuery actuals if wired.
  // A BigQuery failure does NOT sink the response: the estimate still renders and
  // the real error surfaces to the operator as actualsStatus="error" + message.
  const days = billingDays(url.searchParams.get("days"));
  let actuals = null;
  let actualsStatus: ActualsStatus = "not-configured";
  let actualsError: string | undefined;
  if (admin.billing) {
    try {
      actuals = await admin.billing.query(days);
      actualsStatus = "ok";
    } catch (err) {
      actualsStatus = "error";
      actualsError = err instanceof Error ? err.message : String(err);
    }
  }
  json(res, 200, buildBillingReport(overview, admin.rates, actuals, actualsStatus, actualsError, now));
  return true;
}
