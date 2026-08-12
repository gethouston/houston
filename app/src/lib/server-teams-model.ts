import type { AgentTeam, SidebarLayout } from "@houston-ai/engine-client";
import { orderByOverlay, overlayOrderFor } from "./team-overlay.ts";
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
 * Six rules: five in {@link resolveServerTeams} and the write-side
 * `normalizeTeamOverlay` (`team-overlay.ts`, which owns both halves of the
 * overlay). There is no longer a joined/other SPLIT among
 * them — the visibility filter moved SERVER-side, so a caller is served only
 * the teams they are part of and the client has nothing left to partition.
 *
 * Pure and DOM-free so every merge rule below unit-tests under bare Node
 * (`app/tests/server-teams-model.test.ts`). The LOCAL backend
 * (`resolveTeams`) is untouched by any of this: a `TeamView` produced here
 * carries `server` facts, one produced there does not, and that single
 * difference is what keeps the off-capability path byte-identical.
 */

/**
 * Merge the server's teams with the local agent store and the ordering overlay
 * into the `TeamView[]` the rail and the team screen render. Five rules here,
 * in the order they apply (rule 6 is the write-side `normalizeTeamOverlay`, in
 * `team-overlay.ts`):
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
 *    `memberCount` is the whole space's). The team's IDENTITY rides along the
 *    same way: `icon` and `color` are copied straight off the wire, spread only
 *    when present, so a team with none keeps them ABSENT rather than gaining
 *    `undefined`-valued keys — absent is what tells the rail to draw its own
 *    default, and it is also how the gateway spells "unset".
 *
 *    `context` is copied by the SAME spread, and its absence carries more
 *    weight: the field is a text column with an empty default, so a gateway
 *    that has it serves it for every team (`""` when nobody wrote one) and only
 *    a gateway PREDATING it omits the key. That is exactly the feature
 *    detection `teamContextSource` reads, so the key must never be manufactured
 *    here with an `undefined` value.
 */
export function resolveServerTeams(
  serverTeams: readonly AgentTeam[],
  agents: readonly Agent[],
  layout: SidebarLayout,
  defaultSeedName?: string,
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
      ...(team.isDefault && team.name === defaultSeedName
        ? { usesDefaultIdentity: true as const }
        : {}),
      ...(team.icon === undefined ? {} : { icon: team.icon }),
      ...(team.color === undefined ? {} : { color: team.color }),
      ...(team.context === undefined ? {} : { context: team.context }),
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

/** The gateway's team-name cap, in RUNES (cloud `MaxAgentTeamNameRunes`). */
const MAX_TEAM_NAME_RUNES = 60;

/**
 * The name the gateway MINTS a personal space's default team with: the caller's
 * email local-part (before the first `@`, trimmed), else their user id, cut to
 * {@link MAX_TEAM_NAME_RUNES}. Byte-compatible with the gateway's
 * `PersonalOrgName` + `DefaultAgentTeamName` (cloud `internal/store`), which is
 * the whole point: matching it is how the client recognizes an UNTOUCHED
 * personal default team and gives it the "New Team" placeholder identity. In a
 * team space the seed is the org's own name, which the workspace row carries.
 */
export function personalDefaultTeamSeed(
  session: { uid: string; email: string } | null | undefined,
): string | undefined {
  if (!session) return undefined;
  const at = session.email.indexOf("@");
  const local = (at >= 0 ? session.email.slice(0, at) : session.email).trim();
  const name = local !== "" ? local : session.uid;
  const runes = [...name];
  return runes.length <= MAX_TEAM_NAME_RUNES
    ? name
    : runes.slice(0, MAX_TEAM_NAME_RUNES).join("");
}
