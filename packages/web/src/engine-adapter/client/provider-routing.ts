import type { AdapterContext } from "./context";

/**
 * The space-safety rules for routing PROVIDER calls (HOU-979).
 *
 * Cloud routes provider connects and probes at a specific agent's runtime, and
 * the ONLY space-validated source for that id is `ctx.agentList` — the set the
 * CURRENT space's last `listAgents` returned (cleared by `setActiveOrg` the
 * moment the space changes). The persisted `last_agent_id` pref is not
 * space-aware: right after a space switch it still names an agent that belongs
 * to the space the user just left, so routing on it produces
 * `/v1/agents/<other-space-agent>/…` under the NEW `x-houston-org` header. That
 * 404/403 is what surfaced as "the chat picker shows no providers", "the
 * reconnect card never clears", and "the AI hub still says Connected".
 *
 * So: one accessor, and an explicit refusal instead of a guess. Free functions
 * over the context (like `provider-login-poll` / `provider-claude-push`) rather
 * than more methods on it, so this whole concern reads in one place.
 *
 * Strictness applies ONLY while a list is still expected. A list that was asked
 * for and could not be had (`unavailable`) must not brick the app: refusing
 * forever left the picker pinned on "Loading providers…" and every connect
 * throwing "still loading", with no retry. There the client degrades to the
 * pre-HOU-979 pref-based routing, and the next successful list restores strict
 * validation.
 */

/**
 * Whether provider calls can be routed at all yet. Always true off-cloud: one
 * local runtime, nothing to pick.
 */
export function providerRoutingSettled(ctx: AdapterContext): boolean {
  return !ctx.cp || ctx.agentList.kind !== "pending";
}

/** Refuse a provider call rather than guess its target. */
export function requireProviderRouting(ctx: AdapterContext): void {
  if (providerRoutingSettled(ctx)) return;
  throw new Error(
    "This space is still loading. Try connecting again in a moment.",
  );
}

/**
 * The agent id every provider WRITE must target: the space-validated
 * `ctx.providerAgentId()`, never the raw pref. `ctx.requireAgentId()` is
 * deliberately not this — it means "the agent the user has open", for routes
 * (project files, per-agent prefs) where another agent would be the wrong data.
 */
export function requireProviderAgentId(ctx: AdapterContext): string {
  requireProviderRouting(ctx);
  const id = ctx.providerAgentId();
  if (!id) throw new Error("Open an agent first, then connect its account.");
  return id;
}
