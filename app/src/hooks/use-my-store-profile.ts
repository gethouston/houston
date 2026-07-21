import type { CreatorProfile } from "@houston-ai/engine-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEngine } from "../lib/engine";
import { useSession } from "./use-session";

/** Shared query key for the caller's own creator profile. */
export const MY_STORE_PROFILE_KEY = ["store-my-profile"] as const;

/** The signed-in caller's own Agent Store creator profile. */
export interface MyStoreProfile {
  /** The caller's creator profile, or `null` when never claimed / signed out. */
  profile: CreatorProfile | null;
  isPending: boolean;
  isError: boolean;
  /** Drop the cached profile so the next read re-fetches (after a save/avatar change). */
  invalidate: () => Promise<void>;
}

/**
 * The caller's own creator profile (`GET /me/profile`), read only when signed in
 * — the gateway route needs the caller's session bearer, so signed out this
 * resolves to `null` without a request. Shares ONE cache entry
 * ({@link MY_STORE_PROFILE_KEY}) across every consumer (the editor dialog, the
 * publish "publishing as @handle" line, the self-face merge in
 * {@link useMyProfile}); mutations invalidate it so the claimed handle, avatar,
 * and verification re-render from server truth.
 */
export function useMyStoreProfile(): MyStoreProfile {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const enabled = Boolean(session);

  const query = useQuery<CreatorProfile | null>({
    queryKey: MY_STORE_PROFILE_KEY,
    queryFn: () => getEngine().getMyStoreProfile(),
    enabled,
    staleTime: 30_000,
  });

  return {
    profile: query.data ?? null,
    isPending: enabled && query.isPending,
    isError: query.isError,
    invalidate: () => qc.invalidateQueries({ queryKey: MY_STORE_PROFILE_KEY }),
  };
}
