import type { HoustonEngineClient } from "@houston/runtime-client";
// The barrel, not the `cp/*` submodules: the web test suite mocks
// `../control-plane` wholesale — see the note in `endpoint.ts`.
import { runtimeClientFor, setupRuntimeClientFor } from "../control-plane";
import { toOldProvider } from "../synthetic";
import { EngineEndpoint } from "./endpoint";
import { WorkspaceIdResolver } from "./wire-workspace-id";

export type { AgentListState } from "./agent-selection";
export { LAST_AGENT_PREF } from "./agent-selection";
export type { HoustonClientOptions } from "./endpoint";

/**
 * The single, shared state + routing seam behind `HoustonClient`. Every method
 * cluster (the mixins under `client/`) reads `cp`/`engine`/`sdk` from the ONE
 * `AdapterContext` — no per-cluster copy. It is assembled from the two halves
 * that stand on their own: where the client points and who it speaks as
 * ({@link EngineEndpoint}, which also owns `cp` and the in-place repoints), and
 * which agent it acts on (`agent-selection.ts`). What stays here is what needs
 * BOTH — the per-client caches and the rules that pick a runtime to send
 * provider traffic at.
 */
export class AdapterContext extends EngineEndpoint {
  /** Client→server workspace-id translation (the synthetic "default" personal
   *  id no server speaks), resolved once and shared by every caller that puts a
   *  workspace id on the wire. See `wire-workspace-id.ts`. */
  readonly workspaceIds = new WorkspaceIdResolver(this);
  /** In-flight cloud device-code logins, keyed `${agentId}:${providerId}` — the poll guard. */
  readonly activeLogins = new Set<string>();
  /** Per-provider auth-status pollers that translate login completion into events (local mode). */
  readonly loginWatchers = new Map<string, ReturnType<typeof setInterval>>();

  /** Runtime client for provider/auth calls: a real agent's sandbox in cloud
   *  whenever one exists (see {@link providerAgentId}), the single runtime
   *  locally. Before ANY agent exists (first-run onboarding), the host's
   *  hidden SETUP runtime — provider connect must work pre-agent, and its
   *  capture lands on the personal workspace so the agent created next is
   *  already connected. */
  providerEngine(): HoustonEngineClient {
    const cp = this.cp;
    if (!cp) return this.engine;
    const id = this.providerAgentId();
    return id ? runtimeClientFor(cp, id) : setupRuntimeClientFor(cp);
  }

  /** Runtime client pinned to a specific agent, independent of UI selection. */
  providerEngineFor(agentId: string): HoustonEngineClient {
    const cp = this.cp;
    return cp ? runtimeClientFor(cp, agentId) : this.engine;
  }

  async activeOld(): Promise<{ provider: string; model: string }> {
    try {
      // Cloud: providers are PER-AGENT, reached through the control-plane proxy
      // (the per-agent runtime client carries the live token). A top-level
      // /providers on the base client has no route and a stale token → 401.
      const engine = this.providerEngine();
      if (engine) {
        // Bounded: this call sits on the BOOT path (listWorkspaces → the app's
        // wsLoading splash), and a per-agent read against a cold/warming
        // engine is held until the engine wakes — minutes. The value only
        // labels the synthetic workspace, so after a short budget fall back
        // to the defaults instead of wedging the first paint (HOU-693).
        const providers = await Promise.race([
          engine.listProviders(),
          new Promise<null>((r) => setTimeout(() => r(null), 4_000)),
        ]);
        if (providers) {
          const active =
            providers.find((p) => p.isActive) ??
            providers.find((p) => p.configured);
          if (active)
            return {
              provider: toOldProvider(active.id),
              model: active.activeModel,
            };
        }
      }
    } catch {
      /* engine unreachable / no agent selected / not authed → defaults below */
    }
    return { provider: "anthropic", model: "claude-sonnet-4-6" };
  }
}
