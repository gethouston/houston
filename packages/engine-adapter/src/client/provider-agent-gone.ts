import { EngineError } from "@houston/runtime-client";
import { emitLocalEcho } from "../bus";
import type { AdapterContext } from "./context";

/**
 * A provider-routed call answered "the agent this was routed at does not
 * exist" (HOUSTON-APP-52F).
 *
 * Provider calls (the status probe, a login launch) are routed at ONE agent's
 * runtime, picked by `ctx.providerAgentId()` from the id set the last
 * `listAgents` noted. That set goes stale in ordinary use: the user renames an
 * agent (a rename mints a NEW id), deletes one, or another device does. The
 * gateway and the host's authz both answer such a route with
 * `404 { error: "agent not found" }`. Reported as-is it was a red "sign-in
 * failed" card plus a Sentry bug for a state Houston can heal on its own, and
 * the probe swallowed the same answer into "unknown" and re-asked the same
 * dead pod every few seconds for the whole session.
 *
 * Keyed on the body's exact reason, not the bare status: a login launch also
 * 404s for other reasons on the runtime side (a missing login on cancel, see
 * `benignCancelMiss`), and those must keep their own handling.
 */
export function isProviderAgentGoneError(err: unknown): boolean {
  if (!(err instanceof EngineError) || err.status !== 404) return false;
  try {
    const body = JSON.parse(err.body) as { error?: unknown };
    return body.error === "agent not found";
  } catch {
    return false;
  }
}

/**
 * Run a provider-routed call against the agent `providerAgentId()` currently
 * names; when that agent answers "gone", forget it and run the call ONCE more
 * against the re-resolved target (the space's next known agent, or the hidden
 * setup runtime when none is left). The second answer is final: a second
 * "gone" means the whole known list is stale and the caller's normal failure
 * path (loud) is the honest surface.
 *
 * `agentId` is passed to `run` so a caller that pins state to the target
 * (the connect poll's `activeLogins` key) pins the id that actually served.
 */
export async function withProviderAgentRetarget<T>(
  ctx: AdapterContext,
  run: (agentId: string | null) => Promise<T>,
): Promise<T> {
  const first = ctx.providerAgentId();
  try {
    return await run(first);
  } catch (err) {
    if (first === null || !isProviderAgentGoneError(err)) throw err;
    ctx.noteAgentGone(first);
    // The app's roster is as stale as ours was: a workspace-less
    // `AgentsChanged` makes the OPEN workspace re-list its agents (the same
    // silent reload a passive read's agent-gone triggers), so the ghost
    // leaves the rail and the next `listAgents` re-notes the true id set.
    emitLocalEcho("AgentsChanged", {});
    return run(ctx.providerAgentId());
  }
}
