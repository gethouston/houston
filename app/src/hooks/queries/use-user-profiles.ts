import type { UserProfile } from "./user-profiles-map";

export type { UserProfile } from "./user-profiles-map";

/**
 * Shared query-key prefix for the per-contributor `user-profiles` cache entries.
 * The Supabase `profiles` read died with Supabase auth (its RLS matched
 * `auth.uid()`, which cannot match a Firebase uid), so this hook is a stub today
 * and nothing populates the cache — but the key stays exported for the gateway
 * profile store that will repopulate it (follow-up tracked in
 * knowledge-base/auth-migration.md).
 */
export const USER_PROFILES_KEY = "user-profiles";

// Stable empty-map identity so consumers don't get a fresh Map every render
// (which would defeat memoized face-stack children).
const EMPTY_PROFILES: ReadonlyMap<string, UserProfile> = new Map();

/**
 * Resolve display profiles for a set of contributor user ids.
 *
 * DEGRADED (Wave 2a): the Supabase `profiles` table + avatar storage retired
 * with Supabase auth, so there is no roster source to read yet. This keeps its
 * signature and always resolves the stable empty map; teammate face stacks fall
 * back to initials and the self-face falls back to the identity session's
 * displayName/photoUrl (see {@link useMyProfile}). When the gateway profile
 * store lands it repopulates this hook without touching any consumer.
 */
export function useUserProfiles(
  _userIds: string[],
  _opts?: { alwaysEnabled?: boolean },
): {
  profiles: ReadonlyMap<string, UserProfile>;
  isLoading: boolean;
  isError: boolean;
} {
  return { profiles: EMPTY_PROFILES, isLoading: false, isError: false };
}
