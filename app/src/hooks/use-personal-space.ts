import { isPersonalSpace } from "../lib/org-roles.ts";
import { isTeamWorkspace } from "../lib/space-id.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { useCapabilities } from "./use-capabilities.ts";

/**
 * Is the space the user is looking at RIGHT NOW a personal one? The live read
 * behind {@link isPersonalSpace}: the deployment's capabilities plus the id
 * grammar of the active workspace (`org:<slug>` is a team space, anything else
 * is personal).
 *
 * It exists so the surfaces that hide their PEOPLE affordances in a personal
 * space — a team's Members card, the rail's "Join a team" entry — read the
 * question the same way, off one hook, instead of each re-deriving it from the
 * store. Cosmetic only: the gateway is the real enforcer and answers the three
 * member-management routes `403 personal_space` regardless.
 */
export function usePersonalSpace(): boolean {
  const { capabilities } = useCapabilities();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  return isPersonalSpace(
    capabilities,
    isTeamWorkspace(currentWorkspace?.id ?? ""),
  );
}
