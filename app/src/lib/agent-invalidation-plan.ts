import type { HoustonEvent } from "@houston-ai/core";
import { postTurnAgentKeys } from "./agent-invalidation-keys.ts";
import type {
  InvalidationContext,
  InvalidationPlan,
} from "./agent-invalidation-types.ts";
import { queryKeys } from "./query-keys.ts";
import { eventTargetsOpenWorkspace } from "./space-id.ts";

const empty = (): InvalidationPlan => ({
  invalidate: [],
  patchAllConversations: [],
});

/**
 * Map a backend `HoustonEvent` to its cache-invalidation plan.
 *
 * An agent's missions are read from exactly two places, and an agent-scoped
 * mutation event names both. The per-agent board rides `queryKeys.activity`,
 * which is invalidated outright. Every cross-agent surface (sidebar badges,
 * Mission Control, the command palette, the mention notifier) rides the
 * `all-conversations` aggregate, which those events PATCH slice-by-slice
 * instead: invalidating it re-fans-out a read to every agent's pod and wakes
 * the whole fleet, so only a transport-level gap (`EventStreamReconnected`,
 * below) is allowed to pay that cost.
 */
export function planInvalidation(
  ev: HoustonEvent,
  ctx: InvalidationContext,
): InvalidationPlan {
  const plan = empty();
  /** The workspace this window has open — the target of every scoped effect. */
  const open = ctx.workspaceId;

  switch (ev.type) {
    case "ActivityChanged":
      plan.invalidate.push(queryKeys.activity(ev.data.agent_path));
      plan.patchAllConversations.push(ev.data.agent_path);
      break;
    case "SkillsChanged":
      plan.invalidate.push(queryKeys.skills(ev.data.agent_path));
      plan.invalidate.push(queryKeys.skillsManifest(ev.data.agent_path));
      // The open skill's detail pane rides a separate key; refresh it too.
      plan.invalidate.push(["skill-detail", ev.data.agent_path]);
      break;
    case "SharedSkillsChanged":
      // Keyed by the CLIENT's workspace vocabulary, which an event never speaks
      // (see `eventTargetsOpenWorkspace`). The whole family is invalidated
      // rather than a translated key: there is at most one shared-skills list
      // per space in the cache.
      plan.invalidate.push(["shared-skills"]);
      break;
    case "FilesChanged":
      plan.invalidate.push(queryKeys.files(ev.data.agent_path));
      break;
    case "ConfigChanged":
      plan.invalidate.push(queryKeys.config(ev.data.agent_path));
      break;
    case "ContextChanged":
      plan.invalidate.push(queryKeys.instructions(ev.data.agent_path));
      plan.invalidate.push(queryKeys.workspaceContext(ev.data.agent_path));
      break;
    // The role each row names lives on the roster record, so a job description
    // rewritten by the person or by the AI Employee re-lists the roster. An
    // agent outside it (the hosted stream is org-wide) has no row to rename.
    case "AgentRoleChanged":
      if (open && (ctx.isKnownAgent?.(ev.data.agent_path) ?? true)) {
        plan.reloadAgentsWorkspace = open;
      }
      break;
    case "ConversationsChanged":
      plan.patchAllConversations.push(ev.data.agent_path);
      // A message landing in ANY of this agent's conversations (e.g. a
      // teammate's turn) must reach an open chat live. The event carries no
      // session key, so invalidate the agent's whole chat-history prefix —
      // correctness over precision.
      plan.invalidate.push(queryKeys.chatHistoryForAgent(ev.data.agent_path));
      break;
    case "RoutinesChanged":
      plan.invalidate.push(queryKeys.routines(ev.data.agent_path));
      break;
    case "RoutineRunsChanged":
      plan.invalidate.push(["routine-runs", ev.data.agent_path]);
      break;
    case "LearningsChanged":
      plan.invalidate.push(queryKeys.learnings(ev.data.agent_path));
      break;
    case "AgentsChanged":
      if (open && eventTargetsOpenWorkspace(ev.data.workspace_id, open)) {
        plan.reloadAgentsWorkspace = open;
      }
      break;
    case "SidebarLayoutChanged":
      // Best-effort cross-surface/multi-tab sync. The acting user's own change
      // already applied via the optimistic mutation; this refetches for
      // everyone else viewing the same workspace.
      if (open && eventTargetsOpenWorkspace(ev.data.workspace_id, open)) {
        plan.invalidate.push(queryKeys.sidebarLayout(open));
      }
      break;
    // SessionStatus triggers activity invalidation (agent finished → status).
    case "SessionStatus":
      if (ev.data.status === "completed" || ev.data.status === "error") {
        const agentPath = ev.data.agent_path;
        plan.invalidate.push(queryKeys.activity(agentPath));
        plan.patchAllConversations.push(agentPath);
        plan.invalidate.push(...postTurnAgentKeys(agentPath));
      }
      break;
    // A provider OAuth sign-in (or sign-out) finished — refresh the cached
    // provider statuses so the chat model picker reflects the new connection
    // without waiting for the next mount (issue #342).
    case "ProviderLoginComplete":
      plan.invalidate.push(queryKeys.providerStatuses());
      // The hub's Connected rows carry each account's usage — a fresh connect
      // (or sign-out) changes the account set, so those meters refresh
      // alongside the statuses.
      plan.invalidate.push(queryKeys.providerUsage());
      plan.focusWindow = true;
      break;
    // HOU-550: a custom integration was added / credentialed / removed (host add,
    // in-chat credential card, or Integrations page). The event carries no agent
    // path — refresh the user-level custom list plus the connection prefix (a new
    // custom slug joins those views for every agent).
    case "CustomIntegrationsChanged":
      plan.invalidate.push(queryKeys.customIntegrations());
      plan.invalidate.push(["integration-connections"]);
      // The landing of a browser sign-in the user started here: surface the
      // app over the browser, exactly like a provider login (PRODUCT-1298).
      if (ctx.customOAuthReturn) plan.focusWindow = true;
      break;
    // The global event stream came back after a drop (HOU-981). The feed has no
    // replay cursor, so every change that happened while it was down — an agent
    // created, a routine finishing, a teammate's mission, another device — was
    // never delivered, and WHICH ones is unknowable. Guessing a key list is how
    // a surface silently stops tracking reality, so the whole cache is swept —
    // only mounted queries refetch — and the roster reloads with it (it lives
    // in a store, outside the cache, so no invalidation would reach it).
    case "EventStreamReconnected":
      plan.invalidateAll = true;
      if (open) plan.reloadAgentsWorkspace = open;
      break;
  }

  if (ctx.isKnownAgent) {
    const known = ctx.isKnownAgent;
    plan.patchAllConversations = plan.patchAllConversations.filter(known);
  }
  return plan;
}
