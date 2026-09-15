/**
 * Which agent the client acts on, and which agents the active space actually
 * has (HOU-979).
 *
 * This is the half of {@link AdapterContext} that answers "whose pod?" — the
 * persisted selection, the space's live id set, and the rules that pick a pod
 * from the two. It is deliberately free of transport: it holds no config, no
 * engine and no SDK, so the routing rules can be read (and reasoned about)
 * without the endpoint machinery around them. {@link AdapterContext} extends it,
 * so every member here is reached as `ctx.<member>` exactly like the rest.
 */

import { DEFAULT_AGENT_ID } from "../synthetic";

/**
 * localStorage key persisting the selected agent (`setPreference("last_agent_id")`).
 * `providerEngine()` routes provider connects by it, so it must never name an
 * agent the host doesn't have — see `dropLastAgentPref`.
 */
export const LAST_AGENT_PREF = "houston.pref.last_agent_id";

/**
 * What the client knows about the ACTIVE SPACE's agents — the only
 * space-validated source for routing provider calls (HOU-979).
 *
 * Three states, not two, because "we have no list" hides two opposite
 * situations and collapsing them produced two separate bugs:
 *
 *  - `pending` — no list has resolved for THIS space yet (boot, or the window
 *    right after a space switch). The persisted `last_agent_id` still names the
 *    space the user just LEFT, so there is nothing safe to route on: provider
 *    calls refuse and the probe reports "checking".
 *  - `unavailable` — a list was asked for and could not be had (the request
 *    failed, or boot resolved no workspace to list agents for). Waiting forever
 *    on a list that is not coming bricks connect + the picker, so this degrades
 *    to the pre-HOU-979 behavior: route on the pref, probe for real. A later
 *    successful list upgrades back to `known` and strict validation returns.
 *  - `known` — the space's own agent ids. The pref is validated against them.
 */
export type AgentListState =
  | { readonly kind: "pending" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "known"; readonly ids: readonly string[] };

/** The selection + known-agents state, mixed into the adapter context. */
export abstract class AgentSelection {
  private _agentList: AgentListState = { kind: "pending" };

  /**
   * Forget the known set: the ids belong to a space the caller is leaving, and
   * every one of them 404s under the next `x-houston-org`. Back to `pending`,
   * never `unavailable` — a new list IS coming, so provider calls should wait
   * for it rather than degrade to the stale pref.
   */
  protected forgetAgentList(): void {
    this._agentList = { kind: "pending" };
  }

  /** The CP agent the user has selected (persisted as last_agent_id), or null. */
  currentAgentId(): string | null {
    try {
      const id = localStorage.getItem(LAST_AGENT_PREF);
      return id && id !== DEFAULT_AGENT_ID ? id : null;
    } catch {
      return null;
    }
  }

  /**
   * What we know about the ACTIVE space's agents. Ground truth for
   * {@link providerAgentId} and for `provider-routing.ts` — the pref can go
   * stale, a resolved list cannot.
   */
  get agentList(): AgentListState {
    return this._agentList;
  }

  /** Record the live agent-id set (called by every successful cp `listAgents`). */
  noteAgentList(ids: string[]): void {
    this._agentList = { kind: "known", ids };
  }

  /**
   * An agent this client just learned exists (its own create, or the new id a
   * rename minted). Added to the known set so provider routing can pick it
   * before the next `listAgents` — the pref is re-pointed at it by the app,
   * and a pref the list does not contain is ignored in favor of `ids[0]`,
   * which was exactly the stale entry (HOUSTON-APP-52F). No-op while no list
   * is known: there is nothing to validate against yet.
   */
  noteAgentAdded(id: string): void {
    const list = this._agentList;
    if (list.kind !== "known" || list.ids.includes(id)) return;
    this._agentList = { kind: "known", ids: [...list.ids, id] };
  }

  /**
   * An agent the server no longer has: this client's own delete or rename
   * (the old id), or a provider-routed call it answered `404 agent not found`
   * to. Dropped from the known set AND from the selection pref, so the next
   * `providerAgentId()` names a live agent (or the setup runtime when none
   * is left) instead of the same dead pod.
   */
  noteAgentGone(id: string): void {
    const list = this._agentList;
    if (list.kind === "known" && list.ids.includes(id))
      this._agentList = {
        kind: "known",
        ids: list.ids.filter((x) => x !== id),
      };
    this.dropLastAgentPref((pref) => pref === id);
  }

  /**
   * Record that the active space's agent list could NOT be obtained — a failed
   * `listAgents`, or a boot that resolved no workspace to list agents for.
   *
   * Never downgrades a list we already have: a background refresh failing is
   * not a reason to drop validation we can still do. It only converts the
   * "nothing yet" state into "nothing is coming", which is what lets provider
   * calls degrade to the pref instead of refusing forever.
   */
  noteAgentsUnavailable(): void {
    if (this._agentList.kind === "pending")
      this._agentList = { kind: "unavailable" };
  }

  /**
   * The agent PROVIDER calls should target. Provider credentials are
   * workspace-central (connect-once), so ANY real agent's runtime both serves
   * and captures them — the selection only picks a pod:
   *
   *   1. the selected agent, when the live list confirms it still exists;
   *   2. else the org's FIRST known agent — a stale pref or no selection must
   *      not force the setup runtime while real pods exist (the setup pod was
   *      torn down at the org's first agent, and re-materializing one costs a
   *      provision + a lingering Deployment);
   *   3. else `null` → the hidden setup runtime (true first-run, zero agents).
   *
   * With no `known` list there is nothing to validate against, so this falls
   * back to the raw pref. That is only safe once the list is known NOT to be
   * coming (`unavailable`); while it is still `pending`, provider callers must
   * not route at all — see `provider-routing.ts`, which refuses rather than
   * trust a pref that may still name the space the user just left.
   */
  providerAgentId(): string | null {
    const id = this.currentAgentId();
    const list = this._agentList;
    if (list.kind !== "known") return id;
    if (id && list.ids.includes(id)) return id;
    return list.ids[0] ?? null;
  }

  /**
   * Forget the persisted agent selection when it names an agent the control
   * plane no longer has (deleted last agent, wiped user data, account switch) —
   * a stale id sends first-run logins to `/agents/<dead>/…` → 404.
   */
  dropLastAgentPref(isStale: (id: string) => boolean): void {
    try {
      const id = localStorage.getItem(LAST_AGENT_PREF);
      if (id && id !== DEFAULT_AGENT_ID && isStale(id))
        localStorage.removeItem(LAST_AGENT_PREF);
    } catch {
      /* storage disabled — currentAgentId() reads null there anyway */
    }
  }

  /**
   * The SELECTED agent id, or a user-facing error if none is open. For routes
   * that genuinely mean "the agent the user has open" (project files, per-agent
   * prefs), where falling back to another agent would touch the wrong data.
   */
  requireAgentId(): string {
    const id = this.currentAgentId();
    if (!id) throw new Error("Open an agent first, then connect its account.");
    return id;
  }
}
