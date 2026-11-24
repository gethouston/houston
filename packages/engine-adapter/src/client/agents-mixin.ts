import type {
  Agent,
  CreateAgent,
  CreateAgentResult,
  InstalledConfig,
  InstallFromGithub,
  UpdateAgent,
} from "@houston/wire-types";
import * as agents from "../agents";
import * as controlPlane from "../control-plane";
import { readAgentList } from "./agent-list";
import { createAgentViaCp, renameAgentViaCp } from "./agents-cp";
import { HoustonEngineError } from "./errors";
import { deploymentServes } from "./host-capabilities";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function AgentsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Agents extends Base {
    async listAgents(workspaceId: string): Promise<Agent[]> {
      if (this.ctx.cp) {
        let list: Agent[];
        try {
          list = await readAgentList(this.ctx.sdk, this.ctx.cp);
        } catch (e) {
          // A FAILED list is not "not loaded yet" (HOU-979). Left as the latter
          // it never resolves, so the provider probe skipped itself forever
          // (a permanent "Loading providers…") and every connect / sign-out
          // threw "still loading" with no way back. Record that no list is
          // coming so provider routing degrades to the pref-based path, and
          // rethrow — the caller still surfaces the failure.
          this.ctx.noteAgentsUnavailable();
          throw e;
        }
        // CP agent ids are global (the list ignores workspaceId), so this list is
        // the full truth the selection pref must exist in. Pruning here heals a
        // stale pref at boot, before the first-run connect surface mounts; the
        // noted id set is what `providerAgentId()` validates against.
        this.ctx.dropLastAgentPref((id) => !list.some((a) => a.id === id));
        this.ctx.noteAgentList(list.map((a) => a.id));
        return list;
      }
      return agents.listAgents(workspaceId);
    }
    async createAgent(
      workspaceId: string,
      req: CreateAgent,
    ): Promise<CreateAgentResult> {
      if (this.ctx.cp) return createAgentViaCp(this.ctx, req);
      return agents.createAgent(workspaceId, req);
    }
    async renameAgent(
      workspaceId: string,
      agentId: string,
      newName: string,
    ): Promise<Agent> {
      if (this.ctx.cp) return renameAgentViaCp(this.ctx, agentId, newName);
      return agents.renameAgent(workspaceId, agentId, newName);
    }
    async updateAgent(
      workspaceId: string,
      agentId: string,
      req: UpdateAgent,
    ): Promise<Agent> {
      if (this.ctx.cp)
        return controlPlane.applyAgentColor(this.ctx.cp, agentId, req.color);
      return agents.updateAgentColor(workspaceId, agentId, req.color);
    }
    async deleteAgent(workspaceId: string, agentId: string): Promise<void> {
      if (this.ctx.cp) {
        // SDK delegates the DELETE /agents/:id write; web forgets the deleted
        // agent's color overlay (was cp.deleteAgent's clearColor) after.
        await viaSdk(controlPlane.agentPath(agentId), () =>
          this.ctx.sdk.agents.writes.delete(agentId),
        );
        controlPlane.clearColor(agentId);
        // Neither the selection pref nor the known list may outlive the agent:
        // provider connects fall back to the next known agent, or the setup
        // runtime when it was the last one.
        this.ctx.noteAgentGone(agentId);
        return;
      }
      agents.deleteAgent(workspaceId, agentId);
    }
    // Agent-config library: templates the user installed (GitHub) that the
    // create-agent picker merges alongside the bundled ones. Standalone web has
    // no host to keep a library — nothing installed there is the honest answer.
    async listInstalledConfigs(): Promise<InstalledConfig[]> {
      if (!this.ctx.cp) return [];
      // A deployment that advertises `agentConfigLibrary: false` (the hosted
      // gateway) is skipped outright; the 404 fallback below stays for
      // deployments that predate the flag (PRODUCT-1474).
      if (!(await deploymentServes(this.ctx, "agentConfigLibrary"))) return [];
      // SDK delegates the byte-identical GET /v1/agent-configs. It PROPAGATES
      // the 404; web keeps swallowing it — the hosted gateway keeps no
      // account-level config library (one pod per agent, no shared disk) and
      // answers 404 for the route, the same honest answer as standalone web:
      // nothing installed, the picker shows the bundled templates (HOU-688).
      // Every other failure still propagates.
      try {
        return await viaSdk("/v1/agent-configs", () =>
          this.ctx.sdk.agents.library.list(),
        );
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404) return [];
        throw err;
      }
    }
    async installAgentFromGithub(
      req: InstallFromGithub,
    ): Promise<{ agentId: string }> {
      if (!this.ctx.cp)
        throw new Error("Installing agents needs a cloud workspace.");
      // SDK delegates the byte-identical POST /v1/agents/install-from-github
      // with the `{ githubUrl }` body.
      return viaSdk("/v1/agents/install-from-github", () =>
        this.ctx.sdk.agents.library.installFromGithub(req.githubUrl),
      );
    }
  }
  return Agents;
}
