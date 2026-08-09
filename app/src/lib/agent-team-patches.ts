import type { AgentTeam } from "@houston-ai/engine-client";

/**
 * The pure patches an OPTIMISTIC agent-teams write applies before its round
 * trip (C13).
 *
 * Everything here is total and mutation-free: the value a function is handed is
 * still intact afterwards, which is what lets a caller keep it as the snapshot
 * a refusal puts back byte-for-byte. Unit-tested in
 * `app/tests/agent-team-patches.test.ts`.
 */

/**
 * The optimistic move patch: the agent leaves every team holding it and is
 * APPENDED to the target.
 *
 * Appended, and not placed: moving an agent between teams is an explicit action
 * on the team screen rather than a drag, so there is no drop position to
 * honour. The overlay is left alone — it only orders agents INSIDE a team, and
 * an id it no longer holds decays out of it on the next write (rule 7).
 */
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

/** Where one identity field ENDS UP: an omitted patch field leaves what was
 *  there, `""` clears it (back to unset), any other string sets it. */
function nextIdentity(
  current: string | undefined,
  patched: string | undefined,
): string | undefined {
  if (patched === undefined) return current;
  return patched === "" ? undefined : patched;
}

/**
 * Apply an identity patch to the cached teams the way the gateway will:
 * `""` CLEARS the field (it comes back ABSENT), any other string sets it,
 * an omitted field is untouched.
 *
 * The picker LIVE-APPLIES a choice — the rail repaints the moment a glyph is
 * clicked — so the cache has to agree before the round trip, and the rule the
 * patch follows has to be the gateway's own or the block would flicker back to
 * server truth on the next read. An unknown team id changes nothing (the list
 * comes back with every team by identity), because a stale id is a cache one
 * refetch behind, not an error worth inventing a team for.
 *
 * A cleared field is REBUILT away rather than set to `undefined`: unset is
 * ABSENT on the wire, and a cached team carrying an `undefined`-valued `icon`
 * would answer `"icon" in team` differently from the one the next read brings
 * back.
 */
export function applyTeamIdentity(
  teams: readonly AgentTeam[],
  teamId: string,
  patch: { icon?: string; color?: string },
): AgentTeam[] {
  return teams.map((team) => {
    if (team.id !== teamId) return team;
    const { icon: _icon, color: _color, ...rest } = team;
    const icon = nextIdentity(team.icon, patch.icon);
    const color = nextIdentity(team.color, patch.color);
    return {
      ...rest,
      ...(icon === undefined ? {} : { icon }),
      ...(color === undefined ? {} : { color }),
    };
  });
}

/**
 * Apply a shared-context write to the cached teams. Unlike
 * {@link applyTeamIdentity} the key is always WRITTEN, `""` included: `context`
 * is a plain text column with an empty default, so a gateway that serves the
 * field serves it for every team, and its presence is what the client reads as
 * "this gateway supports team context" (`teamContextSource`). Rebuilding it away
 * on an empty string would make saving a blank context look like the feature
 * disappearing.
 *
 * A team the cache does not hold changes nothing — a stale id is a cache one
 * refetch behind, not an error worth inventing a team for.
 */
export function applyTeamContext(
  teams: readonly AgentTeam[],
  teamId: string,
  context: string,
): AgentTeam[] {
  return teams.map((team) =>
    team.id === teamId ? { ...team, context } : team,
  );
}
