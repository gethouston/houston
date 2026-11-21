import {
  type AgentPatch,
  AgentStoreClient,
  type AvatarUploadResult,
  type ClaimInput,
  type ClaimResult,
  type CreatorAnalytics,
  type CreatorProfile,
  type CreatorProfilePatch,
  type HandleAvailability,
  type ReportInput,
  type StoreAgentSummary,
  type StoreCategory,
  type StoreRequestOptions,
} from "@houston/agentstore-client";
import { clientGatewayBase } from "./store-api-types";

const NO_STORE: StoreRequestOptions = { init: { cache: "no-store" } };

function authed(token: string): AgentStoreClient {
  return new AgentStoreClient({
    baseUrl: clientGatewayBase(),
    getToken: () => token,
  });
}

function anon(): AgentStoreClient {
  return new AgentStoreClient({ baseUrl: clientGatewayBase() });
}

export function listCategories(): Promise<StoreCategory[]> {
  return anon().listCategories();
}

export function listMyAgents(token: string): Promise<StoreAgentSummary[]> {
  return authed(token).listMyAgents(NO_STORE);
}

export function claimAgent(
  token: string,
  input: ClaimInput,
): Promise<ClaimResult> {
  return authed(token).claimAgent(input, NO_STORE);
}

export async function patchAgent(
  token: string,
  id: string,
  patch: AgentPatch,
): Promise<void> {
  await authed(token).patchAgent(id, patch, NO_STORE);
}

export async function deleteAgent(token: string, id: string): Promise<void> {
  await authed(token).deleteAgent(id, NO_STORE);
}

export async function reportAgent(
  slug: string,
  input: ReportInput,
): Promise<void> {
  await anon().reportAgent(slug, input);
}

export async function reportCreator(
  handle: string,
  input: ReportInput,
): Promise<void> {
  await anon().reportCreator(handle, input);
}

export function getMyProfile(token: string): Promise<CreatorProfile | null> {
  return authed(token).getMyProfile(NO_STORE);
}

export function patchMyProfile(
  token: string,
  patch: CreatorProfilePatch,
): Promise<CreatorProfile> {
  return authed(token).patchMyProfile(patch, NO_STORE);
}

export function checkHandle(
  token: string,
  handle: string,
): Promise<HandleAvailability> {
  return authed(token).checkHandle(handle, NO_STORE);
}

export function uploadAvatar(
  token: string,
  blob: Blob,
): Promise<AvatarUploadResult> {
  return authed(token).uploadAvatar(blob, NO_STORE);
}

export async function deleteAvatar(token: string): Promise<void> {
  await authed(token).deleteAvatar(NO_STORE);
}

export function getMyAnalytics(
  token: string,
  days?: number,
): Promise<CreatorAnalytics> {
  return authed(token).getMyAnalytics(days, NO_STORE);
}
