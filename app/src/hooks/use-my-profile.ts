import { useUserProfiles } from "./queries/use-user-profiles";
import {
  type MyProfile,
  resolveMyProfile,
  type SessionUserMeta,
} from "./queries/user-profiles-map";
import { useSession } from "./use-session";

export type { MyProfile } from "./queries/user-profiles-map";

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
