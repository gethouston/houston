/**
 * An agent-scoped READ answered "this agent does not exist" (HOUSTON-APP-544).
 *
 * Agent-scoped routes resolve the agent id before anything else: the hosted
 * gateway looks it up in its registry, and the host's own authz does the same
 * (`packages/host/src/routes/agent-authz.ts`) — both answer
 * `404 { error: "agent not found" }` when the id no longer resolves. For a
 * GET the client sends routinely (the skills-manifest queries), that answer
 * has exactly one meaning: the LOCAL ROSTER IS STALE. The agent was deleted
 * or unshared on another device, or a space switch's cache reset
 * (`lib/space-cache.ts`) refired queries built from the previous space's
 * roster under the new `x-houston-org` before `loadAgents` re-resolved.
 *
 * That is an expected, explainable lifecycle state, NOT a Houston bug: the
 * honest surface is the roster without the agent, so the read is silenced
 * (no red bug toast, no Sentry report — `call()` still logs it) and the
 * roster is silently reloaded so the ghost disappears on its own.
 *
 * Like `isMissingSkillError`, the classifier keys on the structural
 * `.status`: the TS host emits bare-string error bodies with no typed
 * `kind`, and an agent-scoped read has exactly one 404 path — the agent is
 * gone (a missing data file answers 200 with empty content, and a missing
 * skill goes through `isMissingSkillError` on its own route) — so the status
 * is unambiguous in context. Applied ONLY to passive reads — the manifest
 * queries and the `passiveAgentRead` wrappers in `lib/tauri.ts`
 * (HOUSTON-APP-4W3 family); writes keep the default loud surfacing.
 */
export function isAgentGoneError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { status?: unknown }).status === 404;
}

/** The agent-store signals the query gate reads. */
export interface AgentRosterSignals {
  /** True once `loadAgents` has settled at least once (even on failure). */
  loaded: boolean;
  /** True while a `loadAgents` is in flight. */
  loading: boolean;
}

/**
 * Whether the CURRENT space's roster has settled, so an agent-scoped query
 * would target this space's agents rather than the previous one's.
 *
 * Same gate as the provider probe's (`providerProbeReady`, HOU-979), for the
 * same race: a space switch wipes the query cache, which refires every
 * mounted agent-scoped query — but the components still render the PREVIOUS
 * space's roster until `loadAgents` re-resolves, so each refetch asks the
 * new org about an agent it never had and gets `404 agent not found`.
 * `loaded` alone is not enough: it stays true across the switch while the
 * re-`loadAgents` runs, which is exactly the window the doomed reads fired
 * in. Both signals together mean "settled, for this space".
 */
export function agentRosterSettled(roster: AgentRosterSignals): boolean {
  return roster.loaded && !roster.loading;
}

/**
 * The self-heal half of the agent-gone contract: a silent roster reload, so
 * an agent the server no longer knows vanishes from the rail instead of
 * sitting there as a ghost whose every surface errors quietly.
 *
 * Factory form so the dedupe is unit-testable: `load` is the store's
 * `loadAgents(workspaceId, { silent: true })`. One reload at a time — a
 * Skills page with several stale agents observes one agent-gone error per
 * manifest query in the same beat, and each mounted surface calls the healer,
 * so concurrent calls collapse into the single in-flight reload. No loop is
 * possible: a reload that still lists the agent changes nothing, and the
 * errored queries (`staleTime: Infinity`) do not refetch on their own.
 */
export function makeRosterHealer(
  load: (workspaceId: string) => Promise<void>,
): (workspaceId: string | null, agentGone: boolean) => Promise<boolean> {
  let inFlight = false;
  return async (workspaceId, agentGone) => {
    if (!agentGone || workspaceId === null || inFlight) return false;
    inFlight = true;
    try {
      await load(workspaceId);
    } finally {
      inFlight = false;
    }
    return true;
  };
}

/**
 * The engine-call-layer trigger: classify a failed passive read and, when the
 * agent is gone, fire the roster heal for the current workspace — the same
 * classify→heal contract `useStaleRosterHeal` gives the query surfaces, for
 * reads whose surfaces don't observe the error (HOUSTON-APP-4W3 family).
 * Factory form so the wiring is unit-testable: `heal` is the ONE shared
 * healer (`lib/roster-heal.ts`) and `currentWorkspaceId` reads the workspace
 * store. Anything but an agent-gone error is a no-op — surfacing stays with
 * the caller.
 */
export function makeAgentGoneHealTrigger(
  heal: (workspaceId: string | null, agentGone: boolean) => Promise<boolean>,
  currentWorkspaceId: () => string | null,
): (err: unknown) => void {
  return (err) => {
    if (!isAgentGoneError(err)) return;
    void heal(currentWorkspaceId(), true);
  };
}
