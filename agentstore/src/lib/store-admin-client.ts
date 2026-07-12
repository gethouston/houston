/**
 * Client-side calls for the moderation console (`/v1/agentstore/admin/*`). Every
 * call carries the signed-in user's bearer; the gateway authorizes by matching
 * the caller's UID against `GW_STORE_ADMIN_UIDS` and fail-closes to 404 when the
 * env is empty, so a non-admin sees the same "not found" a stranger does.
 *
 * The admin response shapes are not pinned in the public contract; these types
 * are the shapes the gateway admin handlers emit, kept in one place so both sides
 * agree. Errors map to `StoreApiError` and are surfaced, never swallowed.
 */
import {
  clientGatewayBase,
  STORE_API_PREFIX,
  toStoreApiError,
} from "./store-api-types";
import type { ReportReason } from "./store-client";

/** An agent awaiting a public-visibility decision (`GET /admin/queue`). */
export interface AdminQueueItem {
  id: string;
  slug: string | null;
  name: string;
  tagline: string | null;
  description: string;
  category: string;
  creator: { displayName: string; url?: string };
  publicRequestedAt: string | null;
}

/** Status of a moderation report. */
export type ReportStatus = "open" | "resolved" | "dismissed";

/**
 * One abuse report in the moderation console (`GET /admin/reports`). The gateway
 * emits a flat shape: the reported agent is referenced by `agentId`/`agentSlug`,
 * with no denormalized name and no `resolvedAt`.
 */
export interface AdminReport {
  id: string;
  reason: ReportReason;
  details: string | null;
  contact: string | null;
  status: ReportStatus;
  createdAt: string;
  agentId: string;
  agentSlug: string | null;
}

/** Result of the retention purge (`POST /admin/purge`). */
export interface PurgeResult {
  draftsDeleted: number;
  softDeletedPurged: number;
}

function url(path: string): string {
  return `${clientGatewayBase()}${STORE_API_PREFIX}${path}`;
}

async function adminFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init?.body) headers.set("content-type", "application/json");
  const res = await fetch(url(path), { ...init, headers, cache: "no-store" });
  if (!res.ok) throw await toStoreApiError(res);
  return res;
}

/** The public-visibility review queue. */
export async function listAdminQueue(token: string): Promise<AdminQueueItem[]> {
  const res = await adminFetch(token, "/admin/queue");
  const body = (await res.json()) as { items: AdminQueueItem[] };
  return body.items;
}

/** Approve (make public) or reject a queued agent. */
export async function actOnQueueItem(
  token: string,
  id: string,
  action: "approve" | "reject",
): Promise<void> {
  await adminFetch(token, `/admin/queue/${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

/** The abuse reports, optionally filtered by status. */
export async function listAdminReports(
  token: string,
  status?: ReportStatus,
): Promise<AdminReport[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await adminFetch(token, `/admin/reports${query}`);
  const body = (await res.json()) as { items: AdminReport[] };
  return body.items;
}

/** Resolve or dismiss a report. */
export async function actOnReport(
  token: string,
  id: string,
  action: "resolve" | "dismiss",
): Promise<void> {
  await adminFetch(token, `/admin/reports/${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

/** Run the retention purge of stale drafts and expired soft-deletes. */
export async function runPurge(token: string): Promise<PurgeResult> {
  const res = await adminFetch(token, "/admin/purge", { method: "POST" });
  return (await res.json()) as PurgeResult;
}
