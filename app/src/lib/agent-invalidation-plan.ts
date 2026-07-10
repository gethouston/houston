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
 * assert, e.g., that an `ActivityChanged` event invalidates the per-agent
 * `conversations` query the board's face stack is derived from.
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
}

const empty = (): InvalidationPlan => ({
  invalidate: [],
  patchAllConversations: [],
});

/**
 * Map a backend `HoustonEvent` to its cache-invalidation plan.
 *
 * Hosted conversations are DERIVED from activities (the host re-projects the
 * activity list into the conversation VM), so an `ActivityChanged` is also a
 * conversations mutation for the per-agent board's face source — which is why
 * that case invalidates `queryKeys.conversations(path)` alongside the activity
 * query. Status/cards ride `activity`; the per-agent face stack rides
 * `conversations`; only invalidating both keeps them coherent live.
 */
export function planInvalidation(
  ev: HoustonEvent,
  ctx: InvalidationContext,
): InvalidationPlan {
  const plan = empty();

  switch (ev.type) {
    case "ActivityChanged":
      plan.invalidate.push(queryKeys.activity(ev.data.agent_path));
      // Hosted conversations are DERIVED from activities (the host re-projects
      // the activity list into the conversation VM), so a contributor stamp
      // that emits `ActivityChanged` IS a conversations mutation for the
      // per-agent board's face stack, which reads `queryKeys.conversations`.
      // Without this the stamped contributors sit in that cache untouched and
      // faces refresh only on remount (navigate away + back).
      plan.invalidate.push(queryKeys.conversations(ev.data.agent_path));
      plan.patchAllConversations.push(ev.data.agent_path);
      break;
    case "SkillsChanged":
      plan.invalidate.push(queryKeys.skills(ev.data.agent_path));
      // The open skill's detail pane rides a separate key; refresh it too.
      plan.invalidate.push(["skill-detail", ev.data.agent_path]);
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
      plan.invalidate.push(queryKeys.conversations(ev.data.agent_path));
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
        plan.invalidate.push(["activity"]);
        plan.patchAllConversations.push(agentPath);
        // Cloud has NO file watcher and no post-turn sync diff, so a running
        // agent that writes its own CLAUDE.md / skills / learnings / files
        // mid-turn never fires a *Changed event. A finished turn is the one
        // reliable signal that the agent may have edited these surfaces, so
        // refetch them for this agent — cheap, and it saves the user from
        // remounting the tab to see self-authored changes (HOU-644). On
        // desktop this is harmless redundancy with the FS watcher.
        plan.invalidate.push(queryKeys.instructions(agentPath));
        plan.invalidate.push(queryKeys.workspaceContext(agentPath));
        plan.invalidate.push(queryKeys.files(agentPath));
        plan.invalidate.push(queryKeys.skills(agentPath));
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
      plan.focusWindow = true;
      break;
  }

  return plan;
}
