import type { AgentTeam, SidebarLayout } from "@houston-ai/engine-client";
import { normalizeTeamOverlay } from "./server-teams-model.ts";
import { type ItemDest, moveItemOp } from "./sidebar-layout-ops.ts";

/**
 * The pure patches an OPTIMISTIC agent-teams write applies before its round
 * trip (C13). One module, because a single gesture touches two caches — the
 * server's teams and the per-user ordering overlay — and two rules living apart
 * is exactly how they end up disagreeing about the same drop.
 *
 * Everything here is total and mutation-free: the value a function is handed is
 * still intact afterwards, which is what lets a caller keep it as the snapshot
 * a refusal puts back byte-for-byte. Unit-tested in
 * `app/tests/agent-team-patches.test.ts`.
 */

/** The optimistic move patch: the agent leaves every team holding it and is
 *  APPENDED to the target (the server owns team order, the overlay owns the
 *  position inside one, and the drop records that separately). */
export function moveAgentInTeams(
  teams: readonly AgentTeam[],
  agentId: string,
  teamId: string,
): AgentTeam[] {
  return teams.map((team) => {
    const without = team.agentSlugs.filter((s) => s !== agentId);
    if (team.id === teamId) {
      return { ...team, agentSlugs: [...without, agentId] };
    }
    return without.length === team.agentSlugs.length
      ? team
      : { ...team, agentSlugs: without };
  });
}

/**
 * The overlay write a CROSS-TEAM drop persists: WHERE inside the destination
 * block the agent landed, pruned against the roster the move ASSERTS rather
 * than the one still cached.
 *
 * The two halves have to be one function, because getting them out of order is
 * a bug with a silent symptom. `normalizeTeamOverlay` narrows a live team's row
 * to the agents the server puts in that team, and until the move lands the
 * destination team does not hold the dropped agent yet: normalized against THAT
 * roster the write deletes the id the drop just recorded, so the position is
 * lost and the agent reappears appended to the block the moment the layout read
 * comes back. Sequencing the two writes instead (patch the teams cache first,
 * then the overlay) cannot fix it either — React Query's `onMutate` runs a
 * microtask after `mutate()`, so a synchronous overlay write that follows it
 * still reads the pre-move roster.
 *
 * `dest.groupId` is the RESOLVED target team id — a real server id, never the
 * local `DEFAULT_TEAM_ID` sentinel and never `null`, which would key the write
 * into `ungroupedOrder`, a list nothing reads on this backend.
 */
export function crossTeamDropOverlay(
  layout: SidebarLayout,
  serverTeams: readonly AgentTeam[],
  agentId: string,
  dest: ItemDest & { groupId: string },
): SidebarLayout {
  return normalizeTeamOverlay(
    moveItemOp(layout, agentId, dest),
    moveAgentInTeams(serverTeams, agentId, dest.groupId),
  );
}

/**
 * The `sortOrder` that puts `teamId` where the rail just dropped it — before
 * `beforeTeamId`, or last when that is `null`. `null` back means the drop
 * changes nothing (or names a team the cache does not hold), so there is
 * nothing to send.
 *
 * The value is the MIDPOINT of the two teams it lands between, `first - 1` at
 * the top and `last + 1` at the bottom. One team moves, so one `PATCH` goes
 * out: renumbering the whole list would fire a request per team and stop
 * halfway at the first team the caller does not own, leaving the space's order
 * half-applied for everybody. C13 takes a plain number, and the gateway sorts
 * by `(sortOrder, createdAt, id)`.
 *
 * `teams` is the WHOLE cached list, the default team included: the rail draws
 * that one as its own trailing block and never lets it be dragged, but the
 * gateway orders it with the rest, so it is a real neighbour. The one position
 * this cannot express is between two teams that already share a `sortOrder` —
 * there is no number between them — and the gateway then keeps its own
 * `(createdAt, id)` tie-break. Neither the gateway nor the fake host mints
 * duplicates, so that is a corrupted-data state, not a flow.
 */
export function teamSortOrderBetween(
  teams: readonly AgentTeam[],
  teamId: string,
  beforeTeamId: string | null,
): number | null {
  const moving = teams.find((t) => t.id === teamId);
  if (!moving) return null;
  const rest = teams.filter((t) => t.id !== teamId);
  const at =
    beforeTeamId === null ? -1 : rest.findIndex((t) => t.id === beforeTeamId);
  const index = at === -1 ? rest.length : at;
  const before = rest[index - 1];
  const after = rest[index];
  const sortOrder =
    before && after
      ? (before.sortOrder + after.sortOrder) / 2
      : after
        ? after.sortOrder - 1
        : before
          ? before.sortOrder + 1
          : moving.sortOrder;
  return sortOrder === moving.sortOrder ? null : sortOrder;
}

/**
 * The optimistic reorder patch: stamp the new `sortOrder` on one team and put
 * the list back in the order the gateway will serve it. The sort is stable and
 * the cached array IS the server's order, so a tie falls back to exactly the
 * `(createdAt, id)` answer the gateway would give.
 */
export function applyTeamSortOrder(
  teams: readonly AgentTeam[],
  teamId: string,
  sortOrder: number,
): AgentTeam[] {
  return teams
    .map((team) => (team.id === teamId ? { ...team, sortOrder } : team))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
