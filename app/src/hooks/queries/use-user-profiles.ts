import { useQuery } from "@tanstack/react-query";
import { isIdentityConfigured } from "../../lib/identity";
import { isMultiplayer } from "../../lib/org-roles";
import { tauriOrg } from "../../lib/tauri";
import { useCapabilities } from "../use-capabilities";
import {
  mapProfilesResult,
  normalizeUserIds,
  profilesQueryEnabled,
  type UserProfile,
} from "./user-profiles-map";

export type { UserProfile } from "./user-profiles-map";

/**
 * Shared query-key prefix for every per-contributor `user-profiles` cache entry
 * (each is `[USER_PROFILES_KEY, ...ids]`). Exported so a profile change can
 * invalidate ALL of them with one prefix match, repainting face stacks.
 */
export const USER_PROFILES_KEY = "user-profiles";

// Stable empty-map identity so a disabled/loading hook doesn't hand consumers a
// fresh Map every render (which would defeat memoized face-stack children).
const EMPTY_PROFILES: ReadonlyMap<string, UserProfile> = new Map();

/**
 * Resolve display profiles (name + photo) for a set of contributor user ids via
 * the gateway's `GET /v1/org/profiles` (its stored GCIP name/picture). Teammate
 * face stacks / the person filter are multiplayer-gated (hosted Teams) —
 * single-player has no roster to resolve. Pass `alwaysEnabled` for the caller's
 * OWN-profile lookup ({@link useMyProfile}): it fires regardless of multiplayer
 * so a signed-in user resolves their own face; off-gateway the read degrades to
 * an empty map and the self-face falls back to the session's displayName/
 * photoUrl. Either way, at least one id and a configured identity backend are
 * required — see {@link profilesQueryEnabled}.
 *
 * The ids are deduped + sorted into a stable query key so the same contributor
 * set (in any order, with repeats) hits one cache entry. Cached generously
 * (profiles change rarely); the query key is NOT org-scoped because a space
 * switch drops the whole query cache (see knowledge-base/teams.md §Spaces).
 */
export function useUserProfiles(
  userIds: string[],
  opts?: { alwaysEnabled?: boolean },
): {
  profiles: ReadonlyMap<string, UserProfile>;
  isLoading: boolean;
  isError: boolean;
} {
  const { capabilities } = useCapabilities();
  const ids = normalizeUserIds(userIds);
  const enabled = profilesQueryEnabled({
    idCount: ids.length,
    authConfigured: isIdentityConfigured(),
    multiplayer: isMultiplayer(capabilities),
    alwaysEnabled: opts?.alwaysEnabled === true,
  });

  const query = useQuery({
    queryKey: [USER_PROFILES_KEY, ...ids],
    queryFn: () =>
      tauriOrg
        .profiles(ids)
        .then((result) => mapProfilesResult(result.profiles)),
    enabled,
    staleTime: 5 * 60_000,
  });

  return {
    profiles: query.data ?? EMPTY_PROFILES,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
  };
}
