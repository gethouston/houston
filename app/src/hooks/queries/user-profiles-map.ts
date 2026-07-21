/**
 * Pure, import-free wire-shape helpers for the per-mission attribution face
 * stacks and the filter-by-person control (hosted Teams). Kept dependency-free
 * so the row->Map translation and id normalization are unit-tested under
 * `node --test` without pulling a live Supabase client.
 */

/**
 * Public-facing profile of a human org member. The `profiles` table grants anon
 * a COLUMN-SCOPED select on exactly these fields (see
 * `supabase/migrations/20260628000000_profiles_anon_column_scope.sql`), so this
 * is a designed public surface, not a leak.
 */
export interface UserProfile {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
}

/** The column-scoped row shape returned by the anon `profiles` select. */
export interface ProfileRow {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
}

/**
 * Sorted, de-duplicated ids. Both the query key and the `.in()` argument use
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
 * Both paths still require at least one id and a configured Supabase client.
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
 * Pure rows -> Map mapping, keyed by `user_id`. A row whose `name`/`avatar_url`
 * is absent (never signed up under a display name, no uploaded avatar) maps to
 * explicit `null`, so a consumer can fall back to initials or a short id rather
 * than render an empty face.
 */
export function mapProfileRows(rows: ProfileRow[]): Map<string, UserProfile> {
  const map = new Map<string, UserProfile>();
  for (const row of rows) {
    map.set(row.user_id, {
      userId: row.user_id,
      name: row.name ?? null,
      avatarUrl: row.avatar_url ?? null,
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

/**
 * The subset of the caller's Agent Store creator profile the self-face reads:
 * their claimed @handle, verification, and the avatar they chose in the store.
 * A bare shape so this pure module keeps importing nothing; a live
 * `CreatorProfile` (from `@houston-ai/engine-client`) structurally satisfies it.
 */
export interface StoreProfileFace {
  handle: string | null;
  avatarUrl: string | null;
  verified: boolean;
}

/** The signed-in caller's resolved identity — one source for every self-face. */
export interface MyProfile {
  userId: string;
  /** Never blank: profile name > OAuth name > email > short id. */
  name: string;
  /** Store avatar > uploaded avatar > provider photo > `null` (render initials). */
  avatarUrl: string | null;
  /** The caller's claimed creator @handle, or `null` when unclaimed. */
  handle: string | null;
  /** Whether the caller's creator profile is verified. */
  verified: boolean;
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
 *
 * When the caller has an Agent Store creator profile (`storeProfile`), it layers
 * on top: its avatar takes precedence over both the uploaded and provider photos
 * (a creator who set a store avatar sees it everywhere), and it supplies the
 * `handle` + `verified` self-face fields. Absent (no claimed profile, or a host
 * where the store isn't reached), `handle` is `null`, `verified` is `false`, and
 * the avatar chain is exactly the prior one.
 */
export function resolveMyProfile(input: {
  userId: string;
  email?: string | null;
  metadata: SessionUserMeta;
  profile?: UserProfile | null;
  storeProfile?: StoreProfileFace | null;
}): MyProfile {
  const { userId, email, metadata, profile, storeProfile } = input;
  return {
    userId,
    name:
      profile?.name ??
      metadata.full_name ??
      metadata.name ??
      email ??
      userId.slice(0, 8),
    avatarUrl:
      storeProfile?.avatarUrl ??
      profile?.avatarUrl ??
      metadata.avatar_url ??
      null,
    handle: storeProfile?.handle ?? null,
    verified: storeProfile?.verified ?? false,
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
