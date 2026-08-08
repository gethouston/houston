import type { AgentTeam, SidebarLayout } from "@houston-ai/engine-client";
import type { TeamView } from "./teams-model.ts";
import type { Agent } from "./types.ts";

/**
 * The SERVER backend of `useTeams()` (C13). On an `agentTeams` host the teams
 * and their rosters come from `GET /v1/org/teams`, and the stored
 * `sidebar_layout` stops being the model: it degrades to a per-user ORDERING
 * OVERLAY (agent order inside a team plus the collapsed flag), keyed by SERVER
 * team id. Unknown or stale ids normalize away silently rather than erroring —
 * the overlay is a preference, never a source of truth.
 *
 * Pure and DOM-free so every merge rule below unit-tests under bare Node
 * (`app/tests/server-teams-model.test.ts`). The LOCAL backend
 * (`resolveTeams`) is untouched by any of this: a `TeamView` produced here
 * carries `server` facts, one produced there does not, and that single
 * difference is what keeps the off-capability path byte-identical.
 */

/** The overlay's `agentIds` for one team, defensively read (the layout is
 *  user-persisted JSON and may predate every team it names). */
function overlayOrderFor(layout: SidebarLayout, teamId: string): string[] {
  const groups = Array.isArray(layout?.groups) ? layout.groups : [];
  const group = groups.find((g) => g?.id === teamId);
  return Array.isArray(group?.agentIds) ? group.agentIds : [];
}

/**
 * RULE 3, applied to one team: members the overlay names come first in the
 * overlay's order, then every remaining member in server order. Mirrors
 * `agent-order.ts`'s `orderBy` (the local backend's identical rule) over a
 * different membership source: here the roster is the server's, so an overlay
 * id this team no longer holds is simply absent from `members` and drops out.
 */
function orderByOverlay(members: Agent[], order: readonly string[]): Agent[] {
  const rank = new Map(order.map((id, i) => [id, i] as const));
  const known = members
    .filter((a) => rank.has(a.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...known, ...members.filter((a) => !rank.has(a.id))];
}

/**
 * Merge the server's teams with the local agent store and the ordering overlay
 * into the `TeamView[]` the rail and the team screen render. Seven rules, in
 * the order they apply:
 *
 * 1. SERVER ORDER WINS. Teams come out in the server's array order (the gateway
 *    already sorts by `(sortOrder, createdAt, id)`); the overlay never reorders
 *    TEAMS, only agents inside one.
 * 2. MEMBERSHIP IS THE SERVER'S. `agentSlugs` is matched against the agent store
 *    by `Agent.id` (on the gateway an agent's id IS its slug). A slug with no
 *    agent row is DROPPED silently: the roster read is the authority on what can
 *    render, and inventing a row for a slug we have no agent for would put a
 *    nameless entry in the rail.
 * 3. ORDER INSIDE A TEAM IS THE OVERLAY'S — see {@link orderByOverlay}. Overlay
 *    ids this team does not hold are ignored, not an error: that is just a stale
 *    drag order after someone else moved the agent.
 * 4. LEFTOVERS LAND IN THE DEFAULT TEAM. An agent no server team claims is
 *    appended to the `isDefault` team in agent-store order. The roster read and
 *    the teams read are two requests, so a just-created agent is in one before
 *    the other and the rail must never lose it. With no default team in the
 *    response the leftovers are dropped: the client never invents a team.
 * 5. `server` FACTS ARE COPIED VERBATIM. `{joined, owner, memberCount,
 *    sortOrder}` are the caller's EFFECTIVE values, resolved server-side; the
 *    client re-deriving any of them would get them wrong (an org admin owns
 *    every team, everyone is joined to the default, and the default's
 *    `memberCount` is the whole space's).
 */
export function resolveServerTeams(
  serverTeams: readonly AgentTeam[],
  agents: readonly Agent[],
  layout: SidebarLayout,
): TeamView[] {
  const byId = new Map(agents.map((a) => [a.id, a] as const));
  const claimed = new Set<string>();

  const teams: TeamView[] = serverTeams.map((team) => {
    const members: Agent[] = [];
    for (const slug of team.agentSlugs) {
      const agent = byId.get(slug);
      // Rule 2: no agent row, no rail row. The de-dupe guards a slug repeated
      // inside one team, which would otherwise render the agent twice.
      if (!agent || members.includes(agent)) continue;
      claimed.add(slug);
      members.push(agent);
    }
    return {
      id: team.id,
      name: team.name,
      agents: orderByOverlay(members, overlayOrderFor(layout, team.id)),
      isDefault: team.isDefault,
      server: {
        joined: team.joined,
        owner: team.owner,
        memberCount: team.memberCount,
        sortOrder: team.sortOrder,
      },
    };
  });

  // Rule 4: the default team absorbs whatever the teams read has not caught up
  // with yet, so an agent can never vanish from the rail between two requests.
  const leftovers = agents.filter((a) => !claimed.has(a.id));
  const fallback = teams.find((t) => t.isDefault);
  if (fallback && leftovers.length > 0) {
    fallback.agents = [...fallback.agents, ...leftovers];
  }
  return teams;
}

/**
 * RULE 6. Split the teams into the caller's own and the rest, preserving order:
 * the rail lists `joined` as "Your teams" and files `other` under a collapsed
 * "Other teams" disclosure. The test is `server?.joined !== false`, so with no
 * server facts at all (the LOCAL backend) everything is joined and the split is
 * a no-op, which is what keeps the off-capability sidebar byte-identical.
 */
export function partitionTeams(teams: readonly TeamView[]): {
  joined: TeamView[];
  other: TeamView[];
} {
  const joined: TeamView[] = [];
  const other: TeamView[] = [];
  for (const team of teams) {
    (team.server?.joined !== false ? joined : other).push(team);
  }
  return { joined, other };
}

/**
 * RULE 7. What gets PERSISTED after an overlay write. It may only ADJUST the
 * rows that describe a LIVE server team, and it must carry every other stored
 * group through UNTOUCHED, in place.
 *
 * For a live team the adjustment is two things: the agent ids are narrowed to
 * the ones the server actually put in that team (so a stale drag order decays
 * on the next write instead of accumulating), and a BLANK name is filled in
 * from the server's own. A row upserted by a first collapse or a first drop is
 * born nameless (`blankOverlayGroup`) because the server names its teams — and
 * that is exactly the value the rail would render if the capability ever went
 * away. `collapsed`, `context` and `ungroupedOrder` are never rewritten: they
 * are inert here (only `id`, `collapsed` and `agentIds` are read on this
 * backend), so churning them would only lose a preference.
 *
 * A group whose id is NOT a live team is somebody's LOCAL grouping, and this
 * function has nothing to check it against. Deleting it looks reasonable until
 * you count the hosts where it fires: an `agentTeams` PERSONAL space serves
 * exactly ONE team, so every group the user built before the capability
 * appeared is "not live", and a single drag or collapse used to persist their
 * names, shared context and membership away for good. The promise this backend
 * makes is that local groups stop DRAWING blocks, not that they stop existing:
 * they sit in the overlay and come back if the capability goes away. A team
 * someone else deleted therefore keeps its (inert, invisible) row, which costs
 * a few bytes of a per-user preference and cannot cost anyone their work.
 *
 * Normalizing on WRITE (not on read) is deliberate: a read-side pass would
 * touch the user's drag order during any window where the teams read is empty
 * or in flight.
 */
export function normalizeTeamOverlay(
  layout: SidebarLayout,
  serverTeams: readonly AgentTeam[],
): SidebarLayout {
  const live = new Map(serverTeams.map((t) => [t.id, t] as const));
  const groups = Array.isArray(layout?.groups) ? layout.groups : [];
  return {
    ...layout,
    groups: groups.map((group) => {
      const team = live.get(group?.id);
      if (team === undefined) return group;
      const roster = new Set(team.agentSlugs);
      const agentIds = Array.isArray(group?.agentIds) ? group.agentIds : [];
      return {
        ...group,
        name: group.name === "" ? team.name : group.name,
        agentIds: agentIds.filter((id) => roster.has(id)),
      };
    }),
  };
}
