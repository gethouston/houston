import { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
import type { HoustonEngineClient } from "@houston/runtime-client";
import { runtimeClientFor, setupRuntimeClientFor } from "../control-plane";
import { toOldProvider } from "../synthetic";
import { EngineEndpoint } from "./endpoint";
import { WorkspaceIdResolver } from "./wire-workspace-id";

export type { AgentListState } from "./agent-selection";
export { LAST_AGENT_PREF } from "./agent-selection";
export type { HoustonClientOptions } from "./endpoint";

export class AdapterContext extends EngineEndpoint {
  readonly workspaceIds = new WorkspaceIdResolver(this);
  readonly activeLogins = new Set<string>();
  readonly loginWatchers = new Map<string, ReturnType<typeof setInterval>>();

  providerEngine(): HoustonEngineClient {
    const cp = this.cp;
    if (!cp) return this.engine;
    const id = this.providerAgentId();
    return id ? runtimeClientFor(cp, id) : setupRuntimeClientFor(cp);
  }

  providerEngineFor(agentId: string): HoustonEngineClient {
    const cp = this.cp;
    return cp ? runtimeClientFor(cp, agentId) : this.engine;
  }

  async activeOld(): Promise<{ provider: string; model: string }> {
    try {
      const engine = this.providerEngine();
      if (engine) {
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
    } catch {}
    return { provider: "anthropic", model: DEFAULT_MODEL.anthropic ?? "" };
  }
}
