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
 * over their session `user_metadata` via {@link resolveMyProfile}: an UPLOADED
 * avatar beats the provider (Google) photo, so replacing your picture updates it
 * everywhere at once.
 *
 * Reuses the batched {@link useUserProfiles} for the caller's own id (with
 * `alwaysEnabled`, since every signed-in user can upload an avatar), so it
 * shares ONE cache entry (`["user-profiles", myId]`) across all self-face
 * consumers AND is invalidated by the avatar-upload mutation the moment a new
 * picture lands — no remount, no refetch fan-out. The own-profile fetch runs
 * whenever there IS a session, INDEPENDENT of multiplayer, so an uploaded photo
 * shows up on desktop / personal-space hosts too (teammate face stacks stay
 * multiplayer-gated). Signed out, `useUserProfiles` stays disabled and this
 * returns `null`; when the profile row hasn't loaded yet it collapses to pure
 * metadata via {@link resolveMyProfile}.
 */
export function useMyProfile(): MyProfile | null {
  const { data: session } = useSession();
  const user = session?.user ?? null;
  const { profiles } = useUserProfiles(user ? [user.id] : [], {
    alwaysEnabled: true,
  });

  if (!user) return null;

  return resolveMyProfile({
    userId: user.id,
    email: user.email,
    metadata: (user.user_metadata ?? {}) as SessionUserMeta,
    profile: profiles.get(user.id) ?? null,
  });
}
