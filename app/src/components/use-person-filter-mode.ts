import { useCapabilities } from "../hooks/use-capabilities";
import { useSession } from "../hooks/use-session";
import {
  type PersonFilterMode,
  personFilterMode,
} from "../lib/mission-person-filter-model";
import { hasSpaces, isMultiplayer } from "../lib/org-roles";
import { isTeamWorkspace } from "../lib/space-id";
import { useWorkspaceStore } from "../stores/workspaces";

export function usePersonFilterMode(): {
  mode: PersonFilterMode;
  user: { id: string; email: string | null } | null;
} {
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const user = session
    ? { id: session.uid, email: session.email || null }
    : null;

  const mode = personFilterMode({
    hasSession: !!user,
    spaces: hasSpaces(capabilities),
    multiplayer: isMultiplayer(capabilities),
    teamSpace: isTeamWorkspace(currentWorkspace?.id ?? ""),
  });

  return { mode, user };
}
