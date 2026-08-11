/**
 * Where an agent-scoped destination LIVES, now that agents have no tab shell.
 *
 * Every agent surface used to be a tab on the agent itself (Activity, Context,
 * Skills, Integrations, Routines, Files, Admin). They are gone: an agent's work
 * is a slice of its TEAM's sections, and configuring an agent is the canonical
 * agent settings page reached through Team Settings. This module is the ONE
 * translation from "take me to agent X's <thing>" into the team view the store
 * actually opens, so a notification, a @mention row, the command palette and a
 * turn summary can never land three different places.
 *
 * Pure and store-free (the caller passes the resolved teams in) so the rules are
 * unit-tested — `app/tests/agent-nav.test.ts`. The imperative side, which reads
 * the stores and dispatches, is `lib/open-agent.ts`.
 */

import type { Agent, Capabilities } from "@houston-ai/engine-client";
import { isAgentManager } from "./agent-access.ts";
import {
  type TeamSectionId,
  type TeamView,
  teamOfAgent,
} from "./teams-model.ts";

/** The things a caller can ask for on one agent. */
type AgentNavTarget = "board" | "routines" | "files" | "settings";

/**
 * The resolved destination. `none` means NO TEAM CLAIMS THIS AGENT (no
 * workspace resolved yet, or a roster read that landed before the teams read):
 * there is no honest surface for the request, and every agent surface is a
 * slice of a team now, so the answer is stated rather than substituted. What to
 * do about it is the CALLER's decision and it differs per target — a board
 * request goes home, a settings request refuses out loud (`lib/open-agent.ts`).
 */
type AgentDestination =
  | {
      view: "team";
      teamId: string;
      section: TeamSectionId;
      /** The agent pin the team sections narrow by (`null` = the whole team). */
      agentFilter: string | null;
      agentFocus: true;
    }
  | { view: "none" };

/** The team section each target opens. */
const TARGET_SECTION: Record<AgentNavTarget, TeamSectionId> = {
  board: "mission-control",
  routines: "routines",
  files: "files",
  settings: "settings",
};

/**
 * The team view that answers "agent X's <target>".
 *
 * The agent rides along as the section's `agentFilter` for the three sections
 * that narrow by it (Mission Control, Routines, Files). Team SETTINGS lists the
 * whole team whatever the pin says (`sectionHonorsAgentPin`), so it carries no
 * filter; the agent it should DRILL INTO travels separately, as the one-shot
 * request the focused agent screen pane consumes.
 */
export function agentDestination(
  teams: TeamView[],
  agentId: string,
  target: AgentNavTarget,
): AgentDestination {
  const team = teamOfAgent(teams, agentId);
  if (team === null) return { view: "none" };
  return {
    view: "team",
    teamId: team.id,
    section: TARGET_SECTION[target],
    agentFilter: agentId,
    agentFocus: true,
  };
}

/**
 * Whether this caller can reach THIS agent's settings page at all.
 *
 * Configuring an agent is a manager's job and the page has ONE door: the
 * agent's own Settings section, drawn only for its managers
 * (`visibleAgentSections`). This is that same gate, asked before an affordance
 * is offered — a caller who fails it must not be shown a "configure this" link,
 * because the request would resolve to a section nothing draws and read as a
 * dead link.
 */
export function canOpenAgentSettings(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): boolean {
  return isAgentManager(caps, agent);
}
