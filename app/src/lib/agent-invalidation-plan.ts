import type { HoustonEvent } from "@houston-ai/core";
import type { QueryKey } from "@tanstack/react-query";
import { queryKeys } from "./query-keys.ts";

/**
 * The set of cache effects a single `HoustonEvent` should produce, expressed
 * declaratively so it can be unit-tested without a React tree. The hook
 * (`use-agent-invalidation.ts`) reads the world (current workspace) and then
 * EXECUTES this plan against the real `QueryClient` + stores.
 *
 * Splitting the decision (pure) from the execution (imperative) is what lets us
 * assert, e.g., that an `ActivityChanged` event invalidates the agent's
 * `activity` query and patches that agent's slice of the cross-agent aggregate.
 */
export interface InvalidationPlan {
  /** Query keys to `invalidateQueries`, in order. */
  invalidate: QueryKey[];
  /** Agent paths whose slice of the `all-conversations` caches to patch. */
  patchAllConversations: string[];
  /** When set, reload this workspace's agent roster (silent). */
  reloadAgentsWorkspace?: string;
  /** When true, pull the app window to the front (browser OAuth returned). */
  focusWindow?: boolean;
}

export interface InvalidationContext {
  /** The currently-open workspace id, or undefined if none. */
  workspaceId?: string;
  /**
   * True when this `CustomIntegrationsChanged` event is the landing of a
   * browser OAuth the user started from this window (the hook consumes the
   * one-shot marker in `custom-oauth-return.ts`). Gates the focus snap-back:
   * the same event also fires for in-app adds and agent-initiated changes,
   * which must never pull the window to the front.
   */
  customOAuthReturn?: boolean;
}

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
 * Mission Control, the command palette, the mentions inbox) rides the
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
      // The server's events carry ITS workspace-id vocabulary (the host's
      // folder name, the gateway's "Houston"), while shared-skills query keys
      // are built from the client's (the synthetic "default" for the personal
      // space — see the adapter's `wireWorkspaceId`). Invalidate the whole
      // family instead of guessing the mapping; there is at most one
      // shared-skills list per space in the cache.
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
      if (ctx.workspaceId && ev.data.workspace_id === ctx.workspaceId) {
        plan.reloadAgentsWorkspace = ctx.workspaceId;
        // C13: EVERY server-team mutation fans out this same event — a team
        // created, renamed or deleted, someone joining or leaving, an agent
        // moved between teams. So the roster reload alone would leave the rail
        // showing the previous grouping until the next mount. The event names
        // no team, so the member rows go by PREFIX, refreshing whichever team's
        // list is open. Inside the workspace guard with the roster reload: on
        // an `agentTeams` host the teams ARE this workspace's grouping, and
        // another workspace's event must not disturb it.
        plan.invalidate.push(queryKeys.agentTeams());
        plan.invalidate.push(["agent-team-members"]);
      }
      break;
    case "SidebarLayoutChanged":
      // Best-effort cross-surface/multi-tab sync. The acting user's own change
      // already applied via the optimistic mutation; this refetches for
      // everyone else viewing the same workspace.
      if (ctx.workspaceId && ev.data.workspace_id === ctx.workspaceId) {
        plan.invalidate.push(queryKeys.sidebarLayout(ctx.workspaceId));
      }
      break;
    // SessionStatus triggers activity invalidation (agent finished → status).
    case "SessionStatus":
      if (ev.data.status === "completed" || ev.data.status === "error") {
        const agentPath = ev.data.agent_path;
        plan.invalidate.push(queryKeys.activity(agentPath));
        plan.patchAllConversations.push(agentPath);
        // Cloud has NO file watcher and no post-turn sync diff, so a running
        // agent that writes its own CLAUDE.md / skills / learnings / files
        // mid-turn never fires a *Changed event. A finished turn is the one
        // reliable signal that the agent may have edited these surfaces, so
        // refetch them for this agent — cheap, and it saves the user from
        // remounting the screen to see self-authored changes (HOU-644). On
        // desktop this is harmless redundancy with the FS watcher.
        plan.invalidate.push(queryKeys.instructions(agentPath));
        plan.invalidate.push(queryKeys.workspaceContext(agentPath));
        plan.invalidate.push(queryKeys.files(agentPath));
        plan.invalidate.push(queryKeys.skills(agentPath));
        plan.invalidate.push(queryKeys.skillsManifest(agentPath));
        plan.invalidate.push(["skill-detail", agentPath]);
        plan.invalidate.push(queryKeys.learnings(agentPath));
        plan.invalidate.push(queryKeys.config(agentPath));
        plan.invalidate.push(queryKeys.routines(agentPath));
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
    // replay cursor, so every change that happened while it was down — a
    // routine finishing, a teammate's mission, another device — was never
    // delivered. The cross-agent aggregate is the one surface that cannot
    // recover on its own (nothing else re-reads it within its freshness
    // window), so it is re-swept. Deliberately JUST the aggregate: a re-sweep
    // already touches every agent's pod, and everything else either rides its
    // own mount or will be corrected by the next event naming its agent.
    case "EventStreamReconnected":
      plan.invalidate.push(queryKeys.allConversations([]));
      break;
  }

  return plan;
}
