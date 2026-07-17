/**
 * Client-side facade over the Agent Store SDK for the moderation console
 * (`/v1/agentstore/admin/*`). Every call carries the signed-in user's bearer;
 * the gateway authorizes by matching the caller's UID against
 * `GW_STORE_ADMIN_UIDS` and fail-closes to 404 when the env is empty, so a
 * non-admin sees the same "not found" a stranger does.
 *
 * This module owns only the browser-specific concerns: the public gateway
 * origin, wrapping the caller's bearer into the SDK's `getToken`, and forcing
 * `cache: "no-store"` on the admin reads. All HTTP and error plumbing lives in
 * `@houston/agentstore-client`.
 */
import {
  type AdminQueueItem,
  type AdminReport,
  AgentStoreClient,
  type PurgeResult,
  type ReportStatus,
  type StoreRequestOptions,
} from "@houston/agentstore-client";
import { clientGatewayBase } from "./store-api-types";

/** Admin calls must never be served from the browser HTTP cache. */
const NO_STORE: StoreRequestOptions = { init: { cache: "no-store" } };

/** An SDK client that authorizes every admin call with the caller's bearer. */
function admin(token: string): AgentStoreClient {
  return new AgentStoreClient({
    baseUrl: clientGatewayBase(),
    getToken: () => token,
  });
}

/** The public-visibility review queue. */
export function listAdminQueue(token: string): Promise<AdminQueueItem[]> {
  return admin(token).adminListQueue(NO_STORE);
}

/** Approve (make public) or reject a queued agent. */
export async function actOnQueueItem(
  token: string,
  id: string,
  action: "approve" | "reject",
): Promise<void> {
  await admin(token).adminActOnQueueItem(id, action, NO_STORE);
}

/** The abuse reports, optionally filtered by status. */
export function listAdminReports(
  token: string,
  status?: ReportStatus,
): Promise<AdminReport[]> {
  return admin(token).adminListReports(status, NO_STORE);
}

/** Resolve or dismiss a report. */
export async function actOnReport(
  token: string,
  id: string,
  action: "resolve" | "dismiss",
): Promise<void> {
  await admin(token).adminActOnReport(id, action, NO_STORE);
}

/** Run the retention purge of stale drafts and expired soft-deletes. */
export function runPurge(token: string): Promise<PurgeResult> {
  return admin(token).adminPurge(NO_STORE);
}
