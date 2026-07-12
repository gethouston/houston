/**
 * Pure, dependency-free helpers for the profile-picture upload flow: file
 * validation, storage path building, and cache-bust URL construction. Kept free
 * of any runtime import (mirrors `user-profiles-map.ts`) so they unit-test under
 * `node --test`. Retained scaffolding: avatar upload itself is disabled while the
 * Supabase-backed store is gone (see knowledge-base/auth-migration.md), and
 * these helpers return with the gateway profile store.
 */

/** 5 MB upload ceiling (checked before any decode work). */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
/** Output edge length; avatars render small, so 256px is plenty. */
export const AVATAR_SIZE_PX = 256;

export type AvatarValidationError = "not-image" | "too-large";

/** Thrown for a client-side rejection the UI localizes (never a server reason). */
export class AvatarValidationFailure extends Error {
  readonly reason: AvatarValidationError;
  constructor(reason: AvatarValidationError) {
    super(reason);
    this.name = "AvatarValidationFailure";
    this.reason = reason;
  }
}

/** Minimal shape validated before decoding — a real `File` satisfies it. */
export interface AvatarFileMeta {
  type: string;
  size: number;
}

/** `null` when acceptable, else the reason the file was rejected. */
export function validateAvatarFile(
  file: AvatarFileMeta,
): AvatarValidationError | null {
  if (!file.type.startsWith("image/")) return "not-image";
  if (file.size > MAX_AVATAR_BYTES) return "too-large";
  return null;
}

/**
 * Object key WITHIN the avatars bucket. The first path segment is the uid, which
 * is exactly what the storage RLS policy authorizes writes against (see
 * `supabase/migrations/20260709000000_avatar_storage.sql`).
 */
export function avatarObjectPath(userId: string, ext: string): string {
  return `${userId}/avatar.${ext}`;
}

/**
 * Append a `v=<version>` param so the browser re-fetches after a re-upload to
 * the SAME object path — upsert keeps the public URL byte-identical, so without
 * this the cached old image would stick.
 */
export function cacheBustedUrl(publicUrl: string, version: number): string {
  const separator = publicUrl.includes("?") ? "&" : "?";
  return `${publicUrl}${separator}v=${version}`;
}
