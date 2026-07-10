import { useQuery } from "@tanstack/react-query";
import { isMultiplayer } from "../../lib/org-roles";
import { isAuthConfigured, supabase } from "../../lib/supabase";
import { useCapabilities } from "../use-capabilities";
import {
  mapProfileRows,
  normalizeUserIds,
  type ProfileRow,
  profilesQueryEnabled,
  type UserProfile,
} from "./user-profiles-map";

export type { UserProfile } from "./user-profiles-map";

/**
 * Shared query-key prefix for every per-contributor `user-profiles` cache entry
 * (each is `[USER_PROFILES_KEY, ...ids]`). Exported so a profile mutation — the
 * avatar upload in `profile-avatar.ts`'s caller — can invalidate ALL of them
 * with one prefix match, repainting face stacks with the new picture.
 */
export const USER_PROFILES_KEY = "user-profiles";

async function fetchProfiles(ids: string[]): Promise<Map<string, UserProfile>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id,name,avatar_url")
    .in("user_id", ids);
  // Surface the real failure through React Query's `isError` (no swallow, no
  // fabricated empty map). Missing avatars are cosmetic, so consumers render a
  // graceful fallback on error rather than toasting — same restraint as the
  // other background/read-only queries (useSession, useOrgAudit) which don't
  // toast a non-user-initiated fetch.
  if (error) throw new Error(error.message);
  return mapProfileRows((data ?? []) as ProfileRow[]);
}

// Stable empty-map identity so a disabled/loading hook doesn't hand consumers a
// fresh Map every render (which would defeat memoized face-stack children).
const EMPTY_PROFILES: ReadonlyMap<string, UserProfile> = new Map();

/**
 * Resolve display profiles for a set of contributor user ids. Teammate face
 * stacks / the person filter are multiplayer-gated (hosted Teams) — single-player
 * has no roster to resolve. Pass `alwaysEnabled` for the caller's OWN-profile
 * lookup ({@link useMyProfile}): every signed-in user can upload an avatar, so
 * they must be able to READ their own `profiles` row regardless of multiplayer,
 * else the uploaded photo is write-only. Either way, at least one id and a
 * configured Supabase client are required. See {@link profilesQueryEnabled}.
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
    authConfigured: isAuthConfigured(),
    multiplayer: isMultiplayer(capabilities),
    alwaysEnabled: opts?.alwaysEnabled === true,
  });

  const query = useQuery({
    queryKey: [USER_PROFILES_KEY, ...ids],
    queryFn: () => fetchProfiles(ids),
    enabled,
    staleTime: 5 * 60_000,
  });

  return {
    profiles: query.data ?? EMPTY_PROFILES,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
  };
}
