import type { AgentTeam, SidebarLayout } from "@houston-ai/engine-client";
import type { Agent } from "./types.ts";

/**
 * The per-user ORDERING OVERLAY: both halves of what the stored
 * `sidebar_layout` degrades to on an `agentTeams` host (C13), where the teams
 * and their rosters are the server's. Reading it orders the members inside one
 * team ({@link orderByOverlay} over {@link overlayOrderFor}); writing it is
 * {@link normalizeTeamOverlay}, which decides what actually gets PERSISTED.
 *
 * Its own module because the overlay is a PREFERENCE with its own rules —
 * defensive reads of user-persisted JSON, silent normalization of stale ids,
 * and a write path that must never destroy a local grouping — while
 * `server-teams-model.ts` is the MERGE of server truth with the agent store.
 * Its read half is called from there; its write half is called by the sidebar's
 * write path (`shell/use-sidebar-overlay-layout.ts`), so the two halves have no
 * caller in common and only this module holds them to the same rules.
 *
 * Pure and DOM-free, unit-tested under bare Node
 * (`app/tests/server-teams-model.test.ts`).
 */

/** The overlay's `agentIds` for one team, defensively read (the layout is
 *  user-persisted JSON and may predate every team it names). */
export function overlayOrderFor(
  layout: SidebarLayout,
  teamId: string,
): string[] {
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
export function orderByOverlay(
  members: Agent[],
  order: readonly string[],
): Agent[] {
  const rank = new Map(order.map((id, i) => [id, i] as const));
  const known = members
    .filter((a) => rank.has(a.id))
    .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...known, ...members.filter((a) => !rank.has(a.id))];
}

/**
 * RULE 6. What gets PERSISTED after an overlay write. It may only ADJUST the
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
