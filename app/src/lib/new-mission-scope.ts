import { AGENT_VIEW_ID, AGENTS_HOME_VIEW_ID } from "./top-level-views.ts";

export type NewMissionScope =
  | { kind: "home" }
  | { kind: "agent"; agentId: string };

export function newMissionScopeFor(ui: {
  viewMode: string;
  agentsHomeAgentId: string | null;
  activeAgentId: string | null;
}): NewMissionScope {
  if (ui.viewMode === AGENTS_HOME_VIEW_ID && ui.agentsHomeAgentId !== null)
    return { kind: "agent", agentId: ui.agentsHomeAgentId };
  if (ui.viewMode === AGENT_VIEW_ID && ui.activeAgentId !== null)
    return { kind: "agent", agentId: ui.activeAgentId };
  return { kind: "home" };
}
