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

export const USER_PROFILES_KEY = "user-profiles";

const EMPTY_PROFILES: ReadonlyMap<string, UserProfile> = new Map();

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
