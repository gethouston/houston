/**
 * What a "new task" means from where the user is STANDING.
 *
 * The phone's compose button lives in one fixed place (the nav bar) while the
 * screens under it are about different subjects, so the button has to read its
 * subject off the location or it would always ask the same context-free
 * question. Drilled into an agent, the agent IS the answer; inside a team, its
 * roster is the shortlist; anywhere else there is no subject and the shared
 * fallback applies.
 *
 * Pure so the rule is unit-tested (`app/tests/new-mission-scope.test.ts`);
 * `lib/new-mission.ts` is the imperative half that spends it.
 */

import { AGENTS_HOME_VIEW_ID, TEAM_VIEW_ID } from "./top-level-views.ts";

export type NewMissionScope =
  | { kind: "home" }
  | { kind: "agent"; agentId: string }
  | { kind: "team"; teamId: string };

export function newMissionScopeFor(ui: {
  viewMode: string;
  agentsHomeAgentId: string | null;
  activeTeamId: string | null;
}): NewMissionScope {
  if (ui.viewMode === AGENTS_HOME_VIEW_ID && ui.agentsHomeAgentId !== null)
    return { kind: "agent", agentId: ui.agentsHomeAgentId };
  if (ui.viewMode === TEAM_VIEW_ID && ui.activeTeamId !== null)
    return { kind: "team", teamId: ui.activeTeamId };
  return { kind: "home" };
}
