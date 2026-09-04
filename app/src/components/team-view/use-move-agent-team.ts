import { useMoveAgentToTeam } from "../../hooks/queries/use-agent-teams";
import { useCapabilities } from "../../hooks/use-capabilities";
import { hasAgentTeams } from "../../lib/org-roles";
import type { TeamView } from "../../lib/teams-model";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useSidebarOverlayLayout } from "../shell/use-sidebar-overlay-layout";
import { localMoveDest } from "./move-agent-model";

/**
 * Move ONE agent into another team, on either backend. This is the whole of
 * "an agent changes teams" now that cross-team drag is gone from the rail, so
 * it has to answer on both, and it branches EXACTLY ONCE — the same shape
 * `use-team-drag-writes.ts` uses for the gesture it replaces.
 *
 * - **Off-capability** the stored `sidebar_layout` IS the model: one optimistic
 *   layout write, the same one the drag made. `localMoveDest` resolves the
 *   virtual default team to the layout's `null` section.
 * - **Server-backed** the roster is the gateway's: `PUT /v1/agents/:slug/team`,
 *   optimistic with rollback and the expected-error toast, both already built
 *   into `useMoveAgentToTeam`.
 *
 * No overlay write follows the server move, deliberately. The overlay records
 * WHERE inside a block an agent sits, and this action names a team, not a
 * position: the agent is appended, which is what an overlay row that does not
 * name it already means (merge rule 3). The stale id left in the old team's row
 * is ignored on read and pruned by rule 7 on the next write.
 *
 * Resolves once the move has SETTLED, success or refusal: a caller that
 * navigates to the agent's new home next (the copy flows) must not resolve
 * that home before the roster knows it, or it lands on the default team. The
 * mutation reports its own refusal (toast + rollback), so a settled promise
 * never rejects and a fire-and-forget caller has nothing to catch.
 */
export function useMoveAgentTeam(): (
  agentId: string,
  team: TeamView,
) => Promise<void> {
  const { capabilities } = useCapabilities();
  const serverBacked = hasAgentTeams(capabilities);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const sidebar = useSidebarOverlayLayout(currentWorkspace?.id, serverBacked);
  const move = useMoveAgentToTeam();

  return (agentId, team) => {
    if (!serverBacked) {
      sidebar.moveItem(agentId, localMoveDest(team));
      return Promise.resolve();
    }
    // `mutateAsync`, not a per-call `onSettled`: TanStack drops per-call
    // callbacks once the observer unmounts, so a dialog closed mid-request
    // would leave the caller awaiting forever. The refusal is already reported
    // and rolled back by the mutation's own onError, so settling quietly here
    // hides nothing.
    return move.mutateAsync({ agentId, teamId: team.id }).then(
      () => undefined,
      () => undefined,
    );
  };
}
