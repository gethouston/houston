import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";
import { makeAgentGoneHealTrigger, makeRosterHealer } from "./agent-gone";

export const healStaleRoster = makeRosterHealer((workspaceId) =>
  useAgentStore.getState().loadAgents(workspaceId, { silent: true }),
);

export const healStaleRosterFromError = makeAgentGoneHealTrigger(
  healStaleRoster,
  () => useWorkspaceStore.getState().current?.id ?? null,
);
