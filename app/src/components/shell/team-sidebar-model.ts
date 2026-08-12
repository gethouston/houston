import type { SidebarLayout } from "@houston-ai/engine-client";
import type { TeamView } from "../../lib/teams-model.ts";

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
