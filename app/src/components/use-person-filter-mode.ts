import type { User } from "@supabase/supabase-js";
import { useCapabilities } from "../hooks/use-capabilities";
import { useSession } from "../hooks/use-session";
import {
  type PersonFilterMode,
  personFilterMode,
} from "../lib/mission-person-filter-model";
import { hasSpaces, isMultiplayer } from "../lib/org-roles";
import { isTeamWorkspace } from "../lib/space-id";
import { useWorkspaceStore } from "../stores/workspaces";

/**
 * The live person-filter presentation decision for the active session +
 * space, plus the signed-in user it hangs off. Wraps the pure
 * {@link personFilterMode} matrix with the app's capability / session /
 * active-space reads so BOTH the filter control itself
 * ({@link MissionPersonFilter}) and any surface that needs to know whether to
 * make room for it (the per-agent board toolbar) share ONE source of truth —
 * no drifting copies of the gate.
 */
export function usePersonFilterMode(): {
  mode: PersonFilterMode;
  user: User | null;
} {
  const { capabilities } = useCapabilities();
  const { data: session } = useSession();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const user = session?.user ?? null;

  const mode = personFilterMode({
    hasSession: !!user,
    spaces: hasSpaces(capabilities),
    multiplayer: isMultiplayer(capabilities),
    teamSpace: isTeamWorkspace(currentWorkspace?.id ?? ""),
  });

  return { mode, user };
}
