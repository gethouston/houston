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
  canSeeTeamSettings,
  type TeamSectionId,
  type TeamView,
  teamOfAgent,
} from "./teams-model.ts";

/** The things a caller can ask for on one agent. */
type AgentNavTarget = "board" | "routines" | "files" | "settings";

/**
 * The resolved destination. `dashboard` is the honest fallback for an agent no
 * team claims (no workspace resolved yet): the cross-agent board still holds
 * every agent's missions, so a mission nav lands on something real instead of a
 * blank pane. It is never a valid answer for a CONFIGURE target — see
 * {@link agentDestination}'s contract.
 */
type AgentDestination =
  | {
      view: "team";
      teamId: string;
      section: TeamSectionId;
      /** The agent pin the team sections narrow by (`null` = the whole team). */
      agentFilter: string | null;
    }
  | { view: "dashboard" };

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
 * request `TeamSettings` consumes.
 */
export function agentDestination(
  teams: TeamView[],
  agentId: string,
  target: AgentNavTarget,
): AgentDestination {
  const team = teamOfAgent(teams, agentId);
  if (team === null) return { view: "dashboard" };
  return {
    view: "team",
    teamId: team.id,
    section: TARGET_SECTION[target],
    agentFilter: target === "settings" ? null : agentId,
  };
}

/**
 * Whether this caller can reach THIS agent's settings page at all.
 *
 * The page has two doors — Team Settings and, for a multiplayer owner/admin,
 * Settings > Permissions — but programmatic navigation always takes the Team
 * Settings one, so its gate is that section's gate. The Permissions door's own
 * gate is strictly narrower, so nothing this admits is unreachable.
 * The section is per team (`visibleTeamSectionsForTeam`), which makes this
 * per agent: the org owner/admin reaches every agent, and a member reaches the
 * agents they MANAGE, because managing one is exactly what opens their team's
 * Settings row. A caller who fails it must not be shown a "configure this"
 * affordance: it would resolve back to Mission Control and read as a dead link.
 */
export function canOpenAgentSettings(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): boolean {
  return canSeeTeamSettings(caps ?? null) || isAgentManager(caps, agent);
}
