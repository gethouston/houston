/**
 * Pure, import-free wire-shape helpers for the per-mission attribution face
 * stacks and the filter-by-person control (hosted Teams). Kept dependency-free
 * so the result->Map translation and id normalization are unit-tested under
 * `node --test` without pulling a live client.
 */

/**
 * A human org member's resolved display face, as the app's face-stack / roster
 * consumers read it. Sourced from the gateway's `GET /v1/org/profiles` (its
 * stored GCIP name + photo); a member who never set a name/photo maps to
 * explicit `null` so a consumer falls back to initials or a short id.
 */
export interface UserProfile {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Sorted, de-duplicated ids. Both the query key and the request argument use
 * this so the same set of contributors — in any order, with any repeats — hits
 * one stable cache entry instead of thrashing a new fetch per card render.
 */
export function normalizeUserIds(ids: string[]): string[] {
  return Array.from(new Set(ids)).sort();
}

/**
 * Should the `user-profiles` query fire? Pure so the gating rule is unit-tested
 * without a live host.
 *
 * - `alwaysEnabled` is the caller's OWN-profile lookup ({@link useMyProfile}):
 *   the signed-in user reads their own `profiles` row (name + uploaded avatar)
 *   independent of multiplayer, because the avatar-upload feature is offered to
 *   every signed-in user (desktop / personal space included), not just orgs.
 *   Without this the uploaded photo is write-only off multiplayer.
 * - Otherwise (teammate face stacks / person filter) it stays multiplayer-gated:
 *   single-player has no roster to resolve.
 *
 * Both paths still require at least one id and a configured identity backend.
 */
export function profilesQueryEnabled(input: {
  idCount: number;
  authConfigured: boolean;
  multiplayer: boolean;
  alwaysEnabled: boolean;
}): boolean {
  const { idCount, authConfigured, multiplayer, alwaysEnabled } = input;
  return idCount > 0 && authConfigured && (alwaysEnabled || multiplayer);
}

/**
 * Pure `GET /v1/org/profiles` result -> Map mapping, keyed by user id. Renames
 * the wire `displayName`/`photoUrl` to the app's `name`/`avatarUrl`, mapping an
 * absent field to explicit `null` (the member set no name/photo) so a consumer
 * falls back to initials or a short id rather than render an empty face.
 */
export function mapProfilesResult(
  profiles: Record<string, { displayName?: string; photoUrl?: string }>,
): Map<string, UserProfile> {
  const map = new Map<string, UserProfile>();
  for (const [userId, p] of Object.entries(profiles)) {
    map.set(userId, {
      userId,
      name: p.displayName ?? null,
      avatarUrl: p.photoUrl ?? null,
    });
  }
  return map;
}

/**
 * The subset of a Supabase session's `user_metadata` the app reads for a
 * self-face: the OAuth display name and the provider (Google) photo. Kept as a
 * bare interface so this pure module never imports `@supabase/supabase-js`.
 */
export interface SessionUserMeta {
  name?: string;
  full_name?: string;
  avatar_url?: string;
}

/** The signed-in caller's resolved identity — one source for every self-face. */
export interface MyProfile {
  userId: string;
  /** Never blank: profile name > OAuth name > email > short id. */
  name: string;
  /** Uploaded avatar > provider photo > `null` (render initials). */
  avatarUrl: string | null;
}

/**
 * Merge the caller's `profiles` row over their session `user_metadata` into the
 * single {@link MyProfile} every self-face consumer reads. An UPLOADED avatar
 * (`profile.avatarUrl`) WINS over the provider (Google) photo so a user who
 * replaces their picture sees it everywhere; the metadata photo is only the
 * fallback for someone who never uploaded. Name resolves profile > OAuth full
 * name/name > email > a short id slice, so it is never blank. On a
 * single-player / non-multiplayer host `profile` is absent and this collapses to
 * pure metadata — byte-identical to the old inline derivation (no behavior
 * change).
 */
export function resolveMyProfile(input: {
  userId: string;
  email?: string | null;
  metadata: SessionUserMeta;
  profile?: UserProfile | null;
}): MyProfile {
  const { userId, email, metadata, profile } = input;
  return {
    userId,
    name:
      profile?.name ??
      metadata.full_name ??
      metadata.name ??
      email ??
      userId.slice(0, 8),
    avatarUrl: profile?.avatarUrl ?? metadata.avatar_url ?? null,
  };
}

/**
 * The avatar image for a teammate face: their uploaded/provider photo when the
 * batched {@link useUserProfiles} lookup resolved one, else `null` so the row
 * falls back to initials. Shared by the People roster and the Share dialog rows
 * so both resolve a face the same way.
 */
export function avatarUrlFromProfiles(
  profiles: ReadonlyMap<string, UserProfile>,
  userId: string,
): string | null {
  return profiles.get(userId)?.avatarUrl ?? null;
}
