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
          this.ctx.noteAgentsUnavailable();
          throw e;
        }
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
        await viaSdk(controlPlane.agentPath(agentId), () =>
          this.ctx.sdk.agents.writes.delete(agentId),
        );
        controlPlane.clearColor(agentId);
        this.ctx.noteAgentGone(agentId);
        return;
      }
      agents.deleteAgent(workspaceId, agentId);
    }
    async listInstalledConfigs(): Promise<InstalledConfig[]> {
      if (!this.ctx.cp) return [];
      if (!(await deploymentServes(this.ctx, "agentConfigLibrary"))) return [];
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
      return viaSdk("/v1/agents/install-from-github", () =>
        this.ctx.sdk.agents.library.installFromGithub(req.githubUrl),
      );
    }
  }
  return Agents;
}
