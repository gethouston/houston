import type { QueryKey } from "@tanstack/react-query";

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
  /**
   * Mark EVERY cached query stale (unfiltered `invalidateQueries()`) — for the
   * one case where the missed changes are unknowable: a transport gap. Only
   * mounted queries refetch, so the cost is bounded by what is on screen, and
   * no future query family can be forgotten here.
   */
  invalidateAll?: boolean;
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
  /**
   * Whether an agent path is in the viewer's CURRENT roster. The hosted
   * event stream is org-wide (the gateway fans in every awake pod in the
   * space, not just the viewer's assigned agents), so an agent-scoped event
   * can name an agent this viewer is not allowed to read — and the aggregate
   * patch it would trigger is a deterministic `403 not allowed` on every
   * event that agent emits (HOUSTON-APP-540). An agent outside the roster
   * has no slice in the aggregate to patch, so the read is skipped, not
   * attempted. Absent means "every agent is known" (single-user hosts).
   */
  isKnownAgent?: (agentPath: string) => boolean;
}
