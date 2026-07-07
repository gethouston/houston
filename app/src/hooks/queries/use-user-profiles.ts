import { useQuery } from "@tanstack/react-query";
import { isMultiplayer } from "../../lib/org-roles";
import { isAuthConfigured, supabase } from "../../lib/supabase";
import { useCapabilities } from "../use-capabilities";
import {
  mapProfileRows,
  normalizeUserIds,
  type ProfileRow,
  type UserProfile,
} from "./user-profiles-map";

export type { UserProfile } from "./user-profiles-map";

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
 * Resolve display profiles for a set of contributor user ids. Enabled only on a
 * configured, multiplayer (hosted Teams) host with at least one id to look up —
 * single-player/desktop has no `profiles` surface and never runs this.
 */
export function useUserProfiles(userIds: string[]): {
  profiles: ReadonlyMap<string, UserProfile>;
  isLoading: boolean;
  isError: boolean;
} {
  const { capabilities } = useCapabilities();
  const ids = normalizeUserIds(userIds);
  const enabled =
    ids.length > 0 && isAuthConfigured() && isMultiplayer(capabilities);

  const query = useQuery({
    queryKey: ["user-profiles", ...ids],
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
