import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";
import { makeAgentGoneHealTrigger, makeRosterHealer } from "./agent-gone";

/**
 * THE stale-roster healer — the silent roster reload that makes a ghost agent
 * (one the server no longer knows) disappear from the rail on its own. ONE
 * module-level instance, so every trigger path — the surfaces'
 * `useStaleRosterHeal` hook and the engine-call layer's `passiveAgentRead`
 * (`lib/tauri.ts`) — shares a single in-flight dedupe; see `makeRosterHealer`
 * for why this cannot loop.
 */
export const healStaleRoster = makeRosterHealer((workspaceId) =>
  useAgentStore.getState().loadAgents(workspaceId, { silent: true }),
);

/**
 * Heal when a failed engine read says the agent is gone; a no-op for every
 * other error. Reads the workspace from the store because the engine-call
 * layer has no render context to take it from.
 */
export const healStaleRosterFromError = makeAgentGoneHealTrigger(
  healStaleRoster,
  () => useWorkspaceStore.getState().current?.id ?? null,
);
