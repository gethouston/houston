import { useUserProfiles } from "./queries/use-user-profiles";
import {
  type MyProfile,
  resolveMyProfile,
  type SessionUserMeta,
} from "./queries/user-profiles-map";
import { useSession } from "./use-session";

export type { MyProfile } from "./queries/user-profiles-map";

/**
 * The signed-in caller's ONE resolved identity — the single source every
 * self-face reads (sidebar user menu, account row, the agent header person
 * scope, Mission Control's person filter). Merges the caller's `profiles` row
 * over their identity-session metadata (display name + provider photo) via
 * {@link resolveMyProfile}. The Supabase `profiles` store retired with Supabase
 * auth, so {@link useUserProfiles} is a stub returning an empty map today (the
 * gateway profile store is a follow-up — see knowledge-base/auth-migration.md);
 * the merge collapses to the session's displayName/photoUrl, and the seam is
 * kept so a future row transparently wins once the gateway store lands.
 *
 * Reuses the batched {@link useUserProfiles} for the caller's own id (with
 * `alwaysEnabled`), so it shares ONE cache entry (`["user-profiles", myId]`)
 * across all self-face consumers. Signed out, this returns `null`.
 */
export function useMyProfile(): MyProfile | null {
  const { data: session } = useSession();
  const { profiles } = useUserProfiles(session ? [session.uid] : [], {
    alwaysEnabled: true,
  });

  if (!session) return null;

  const metadata: SessionUserMeta = {
    name: session.displayName ?? undefined,
    avatar_url: session.photoUrl ?? undefined,
  };
  return resolveMyProfile({
    userId: session.uid,
    email: session.email,
    metadata,
    profile: profiles.get(session.uid) ?? null,
  });
}
