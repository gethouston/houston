import type { SidebarLayout } from "@houston-ai/engine-client";
import type {
  SidebarDefaultGroupView,
  SidebarGroupView,
  SidebarItem,
} from "@houston-ai/layout";
import { flatSidebarOrder } from "../../lib/agent-order";
import type { TeamHighlight } from "../../lib/sidebar-teams";
import { teamRowActive } from "../../lib/sidebar-teams";
import { teamDisplayName } from "../../lib/team-display";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import {
  type AgentItemArgs,
  buildAgentSidebarItems,
} from "./agent-sidebar-items";
import { teamHeaderSignals } from "./team-header-signals";
import { teamCollapsedLookup } from "./team-sidebar-model";

export interface BuildTeamSidebarListsArgs extends AgentItemArgs {
  agents: Agent[];
  layout: SidebarLayout;
  /** `useTeams()` — named teams in display order, the default team last. */
  teams: TeamView[];
  highlight: TeamHighlight;
  /**
   * The agent row the rail is drawing as selected (`sidebarSelectedAgentId`),
   * or null. The rail fills EXACTLY ONE row: a block whose own agent is lit
   * leaves its header unfilled, so this is resolved once by the caller and
   * handed down rather than re-derived per block.
   */
  selectedAgentId: string | null;
  newTeamLabel: string;
}

/**
 * Derive the `AppSidebar` view model from the teams: `items` is EVERY agent in
 * flat visible order (so the rail, the collapsed rail and ⌘[ / ⌘] cycling agree
 * on one order), `groups` places each named team's members by id, and
 * `defaultGroup` names the trailing block after the workspace.
 *
 * A block is a HEADER and its agents, and nothing else. A team's destinations
 * are tabs on the screen its header opens: four rows per team is most of the
 * rail spent on the same four words repeated, and the rail's job is to say
 * WHICH team, not which of its surfaces.
 *
 * The stored `sidebar_layout` is untouched by all of this: the default team is
 * virtual (`resolveTeams`), so a team block is a way of DRAWING the layout, not
 * a new thing written to it.
 */
export function buildTeamSidebarLists({
  agents,
  layout,
  teams,
  highlight,
  selectedAgentId,
  newTeamLabel,
  ...itemArgs
}: BuildTeamSidebarListsArgs): {
  items: SidebarItem[];
  groups: SidebarGroupView[];
  defaultGroup: SidebarDefaultGroupView | undefined;
} {
  const isCollapsed = teamCollapsedLookup(layout);
  /** This block holds the agent row the rail is filling, so its header defers. */
  const holdsSelectedAgent = (team: TeamView) =>
    selectedAgentId !== null &&
    team.agents.some((agent) => agent.id === selectedAgentId);

  const items = buildAgentSidebarItems({
    agents: flatSidebarOrder(agents, layout),
    ...itemArgs,
  });
  const headerSignals = teamHeaderSignals(itemArgs);

  const groups: SidebarGroupView[] = teams
    .filter((team) => !team.isDefault)
    .map((team) => {
      // Spread rather than assign: an absent mask and a mask of `undefined`
      // read the same to the library, but only the omission leaves the view
      // model literally as it was before masks existed.
      const collapsed = isCollapsed(team);
      return {
        id: team.id,
        name: teamDisplayName(team, newTeamLabel),
        collapsed,
        // Every block wears the same COMPONENT, the default team included: a
        // block IS a team whether or not it is a stored group, and a second
        // glyph rule for one of them would invite the reader to look for a
        // difference the model does not have.
        //
        // What it draws is no longer fixed. A team with no icon and no colour
        // set still renders the neutral monochrome mark inheriting the row's
        // ink, exactly as before; a team whose owner picked an identity wears
        // it, on the same palette the agent avatars below use. The rationale
        // for bending `sidebar-anatomy.md`'s "a glyph never pins a colour" is
        // in `team-glyph.tsx`.
        ...headerSignals(team, collapsed),
        // The header says "you are here" for the block, folded or open — unless
        // one of its own agent rows is saying something more precise.
        active: teamRowActive({
          teamId: team.id,
          highlight,
          agentRowLit: holdsSelectedAgent(team),
        }),
        itemIds: team.agents.map((a) => a.id),
      };
    });

  const defaultTeam = teams.find((team) => team.isDefault);
  const defaultCollapsed = defaultTeam ? isCollapsed(defaultTeam) : false;
  // The block is asked the same question every other block is asked, so
  // "may I edit this one?" is answered by ONE gate rather than by a second
  // rule that only the default team reads.
  const defaultGroup = defaultTeam
    ? {
        name: teamDisplayName(defaultTeam, newTeamLabel),
        // The default block folds like any other: a block that folded
        // everywhere except here would make it the one row in the rail that
        // answers a click differently.
        collapsed: defaultCollapsed,
        // The same component every other block wears, for the same reason.
        ...headerSignals(defaultTeam, defaultCollapsed),
        active: teamRowActive({
          teamId: defaultTeam.id,
          highlight,
          agentRowLit: holdsSelectedAgent(defaultTeam),
        }),
      }
    : undefined;

  return { items, groups, defaultGroup };
}
