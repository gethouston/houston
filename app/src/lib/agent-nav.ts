import type {
  Agent,
  Capabilities,
  SidebarLayout,
} from "@houston/engine-adapter";
import { isAgentManager } from "./agent-access.ts";
import { firstSidebarAgentId } from "./agent-order.ts";
import type { TeamSectionId } from "./teams-model.ts";

type AgentNavTarget = "board" | "routines" | "files" | "settings";

export type AgentDestination =
  | { kind: "agent-view"; agentId: string; section: TeamSectionId }
  | { kind: "task-list"; agentId: string };

const TARGET_SECTION: Record<AgentNavTarget, TeamSectionId> = {
  board: "mission-control",
  routines: "routines",
  files: "files",
  settings: "settings",
};

export function agentDestination(
  agentId: string,
  target: AgentNavTarget,
  isMobile: boolean,
): AgentDestination {
  if (isMobile && (target === "board" || target === "settings"))
    return { kind: "task-list", agentId };
  return { kind: "agent-view", agentId, section: TARGET_SECTION[target] };
}

export function workingAgentId(
  currentId: string | null,
  agents: Agent[],
  layout: SidebarLayout,
): string | null {
  if (agents.some((a) => a.id === currentId)) return currentId;
  return firstSidebarAgentId(agents, layout);
}

export function canOpenAgentSettings(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): boolean {
  return isAgentManager(caps, agent);
}
