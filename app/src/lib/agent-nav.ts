/** Map an employee target to the screen that shows it. */

import type {
  Agent,
  Capabilities,
  SidebarLayout,
} from "@houston/engine-adapter";
import { isAgentManager } from "./agent-access.ts";
import { firstSidebarAgentId } from "./agent-order.ts";
import type { TeamSectionId } from "./teams-model.ts";

/** The things a caller can ask for on one agent. */
type AgentNavTarget = "board" | "routines" | "files" | "settings";

/**
 * Where an employee target lands: a section of the employee's own screen, or,
 * on the phone, that employee's ONE task list (the AI Employees drill-in),
 * which also opens Settings in place.
 */
export type AgentDestination =
  | { kind: "agent-view"; agentId: string; section: TeamSectionId }
  | { kind: "task-list"; agentId: string };

/** The employee section each target opens. */
const TARGET_SECTION: Record<AgentNavTarget, TeamSectionId> = {
  board: "mission-control",
  routines: "routines",
  files: "files",
  settings: "settings",
};

/** The destination for an employee-scoped request at this width. */
export function agentDestination(
  agentId: string,
  target: AgentNavTarget,
  isMobile: boolean,
): AgentDestination {
  if (isMobile && (target === "board" || target === "settings"))
    return { kind: "task-list", agentId };
  return { kind: "agent-view", agentId, section: TARGET_SECTION[target] };
}

/**
 * The employee a nav that names none works on (a compose off every board, a
 * lesson beat, a hands-on errand): the current one, else the first in sidebar
 * order. `null` only for an empty roster.
 */
export function workingAgentId(
  currentId: string | null,
  agents: Agent[],
  layout: SidebarLayout,
): string | null {
  if (agents.some((a) => a.id === currentId)) return currentId;
  return firstSidebarAgentId(agents, layout);
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
