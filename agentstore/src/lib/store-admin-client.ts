import {
  type AdminGrantHandleInput,
  type AdminQueueItem,
  type AdminReport,
  AgentStoreClient,
  type CreatorProfile,
  type CreatorReport,
  type PurgeResult,
  type ReportStatus,
  type StoreRequestOptions,
} from "@houston/agentstore-client";
import { clientGatewayBase } from "./store-api-types";

const NO_STORE: StoreRequestOptions = { init: { cache: "no-store" } };

function admin(token: string): AgentStoreClient {
  return new AgentStoreClient({
    baseUrl: clientGatewayBase(),
    getToken: () => token,
  });
}

export function listAdminQueue(token: string): Promise<AdminQueueItem[]> {
  return admin(token).adminListQueue(NO_STORE);
}

export async function actOnQueueItem(
  token: string,
  id: string,
  action: "approve" | "reject",
): Promise<void> {
  await admin(token).adminActOnQueueItem(id, action, NO_STORE);
}

export function listAdminReports(
  token: string,
  status?: ReportStatus,
): Promise<AdminReport[]> {
  return admin(token).adminListReports(status, NO_STORE);
}

export async function actOnReport(
  token: string,
  id: string,
  action: "resolve" | "dismiss",
): Promise<void> {
  await admin(token).adminActOnReport(id, action, NO_STORE);
}

export function runPurge(token: string): Promise<PurgeResult> {
  return admin(token).adminPurge(NO_STORE);
}

export async function setCreatorVerified(
  token: string,
  handle: string,
  verified: boolean,
): Promise<void> {
  await admin(token).adminSetCreatorVerified(handle, verified, NO_STORE);
}

export function grantCreatorHandle(
  token: string,
  handle: string,
  input: AdminGrantHandleInput,
): Promise<CreatorProfile> {
  return admin(token).adminGrantCreatorHandle(handle, input, NO_STORE);
}

export async function releaseCreatorHandle(
  token: string,
  handle: string,
): Promise<void> {
  await admin(token).adminReleaseHandle(handle, NO_STORE);
}

export function listCreatorReports(
  token: string,
  status?: ReportStatus,
): Promise<CreatorReport[]> {
  return admin(token).adminListCreatorReports(status, NO_STORE);
}

export async function actOnCreatorReport(
  token: string,
  id: string,
  action: "resolve" | "dismiss",
): Promise<void> {
  await admin(token).adminActOnCreatorReport(id, action, NO_STORE);
}
