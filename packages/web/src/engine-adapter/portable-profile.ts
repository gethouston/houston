/**
 * The caller's Agent Store creator profile — the "publish as @handle" identity,
 * its handle claim + avatar, and the per-day install analytics panel.
 *
 * Same shape as the owner flow in `portable-store.ts`: the APP owns the network,
 * driving the gateway `/v1/agentstore/me/*` routes through the shared
 * {@link AgentStoreClient} with the user's OWN bearer + the 401-refresh/replay
 * discipline riding the injected `storeAuthFetch` seam. Both the client builder
 * (`storeClient`) and the {@link StoreApiError}→{@link HoustonEngineError} mapper
 * (`asEngineError`) are reused from `portable-store.ts` — this module adds no
 * transport of its own.
 */

import type {
  AvatarUploadResult,
  CreatorAnalytics,
  CreatorProfile,
  CreatorProfilePatch,
  HandleAvailability,
} from "../../../../ui/engine-client/src/types";
import type { ControlPlaneConfig } from "./control-plane";
import { asEngineError, storeClient } from "./portable-store";

/** The caller's own creator profile, or `null` when never materialized. */
export function getMyStoreProfile(
  cfg: ControlPlaneConfig,
): Promise<CreatorProfile | null> {
  return asEngineError(() => storeClient(cfg).getMyProfile());
}

/** Upsert the caller's creator profile (`PATCH /me/profile`). */
export function updateMyStoreProfile(
  cfg: ControlPlaneConfig,
  patch: CreatorProfilePatch,
): Promise<CreatorProfile> {
  return asEngineError(() => storeClient(cfg).patchMyProfile(patch));
}

/** Whether a handle is claimable by the caller (`GET /handles/{handle}/available`). */
export function checkStoreHandle(
  cfg: ControlPlaneConfig,
  handle: string,
): Promise<HandleAvailability> {
  return asEngineError(() => storeClient(cfg).checkHandle(handle));
}

/** Replace the caller's avatar (`POST /me/avatar`, multipart field `file`). */
export function uploadStoreAvatar(
  cfg: ControlPlaneConfig,
  blob: Blob,
): Promise<AvatarUploadResult> {
  return asEngineError(() => storeClient(cfg).uploadAvatar(blob));
}

/** Clear the caller's avatar (`DELETE /me/avatar`). Idempotent. */
export function deleteStoreAvatar(cfg: ControlPlaneConfig): Promise<void> {
  return asEngineError(() => storeClient(cfg).deleteAvatar());
}

/** Per-UTC-day install analytics over the caller's owned agents (`GET /me/analytics?days=`). */
export function getMyStoreAnalytics(
  cfg: ControlPlaneConfig,
  days?: number,
): Promise<CreatorAnalytics> {
  return asEngineError(() => storeClient(cfg).getMyAnalytics(days));
}
