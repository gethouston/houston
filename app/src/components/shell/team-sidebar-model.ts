import type { SidebarLayout } from "@houston-ai/engine-client";
import type { SidebarGroupAffordances } from "@houston-ai/layout";
import {
  canDeleteTeam,
  canLeaveTeam,
  canRenameTeam,
  type TeamView,
} from "../../lib/teams-model.ts";

/**
 * Whether a team's block is folded shut, for EVERY team the rail draws.
 *
 * One resolver rather than two readings of the same layout, because the answer
 * is needed twice and the two must agree: the block builder paints a collapsed
 * team's header as active (`teamRowActive`), and the highlight drops the agent
 * pin for exactly the same teams (`sidebarSelectedAgentId`) since their agent
 * rows are not drawn. Two copies would eventually light a header AND an agent
 * row in one folded block.
 *
 * The flag lives in two places because the default team is VIRTUAL: it owns no
 * stored group row, so its state is the layout's own additive
 * `defaultCollapsed` (absent reads as expanded), while a named team's is its
 * group's `collapsed`. A team with no stored row at all (a server team nobody
 * has folded yet) is expanded.
 */
export function teamCollapsedLookup(
  layout: SidebarLayout,
): (team: TeamView) => boolean {
  const byId = new Map(
    (Array.isArray(layout?.groups) ? layout.groups : []).map((group) => [
      group.id,
      !!group.collapsed,
    ]),
  );
  const defaultCollapsed = layout?.defaultCollapsed ?? false;
  return (team) =>
    team.isDefault ? defaultCollapsed : (byId.get(team.id) ?? false);
}

/**
 * Which header-menu affordances each team block offers, per team.
 *
 * A pure builder rather than a closure inside `use-server-team-actions.ts`: it
 * reads nothing but its three arguments and the team in hand, it is asked once
 * per block on every render, and keeping it here puts the rail's "may I?"
 * answers beside its other pure team vocabulary — where they can be unit-tested
 * without mounting a sidebar.
 *
 * Off-capability it returns `undefined`, which is NO mask at all: the library
 * reads that as every affordance the host wired a callback for, exactly the
 * pre-C13 rendering. Only the server branch has opinions to state.
 */
export function teamAffordanceMask({
  serverBacked,
  personalSpace,
  selfId,
}: {
  /** `hasAgentTeams(capabilities)` — the host owns the teams (C13). */
  serverBacked: boolean;
  /** Whether the ACTIVE space is a personal one (`usePersonalSpace`). */
  personalSpace: boolean;
  /** The signed-in user's id, or null when there is no session. */
  selfId: string | null;
}): (team: TeamView) => SidebarGroupAffordances | undefined {
  return (team) =>
    serverBacked
      ? {
          // Name, mark and colour are ONE identity behind one menu entry, and
          // C13 reads all of it as a rename — so the entry reads the rename
          // gate, which also means the default team gets it (C13 lets its
          // owner rename that one).
          edit: canRenameTeam(team),
          delete: canDeleteTeam(team),
          // No session id means no `:userId` to send, so there is no call to
          // make: hide the affordance rather than offer a dead one. The
          // personal-space half of the question lives in `canLeaveTeam`,
          // beside the other two backends it answers for.
          leave: canLeaveTeam(team, personalSpace) && selfId !== null,
        }
      : undefined;
}
