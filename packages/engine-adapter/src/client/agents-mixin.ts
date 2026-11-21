import { migrateProviderModel } from "@houston/domain";
import type {
  Agent,
  CreateAgent,
  CreateAgentResult,
  GenerateInstructionsResult,
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
    /**
     * Writes a first draft of an agent's instructions from a description of it.
     *
     * @assistant group:agents
     * @assistant hidden: a one-shot generation turn on a runtime, not an app operation; an assistant writes the instructions itself and saves them with writeAgentFile.
     *
     * Create-with-AI: one one-shot generation turn on the runtime — the selected
     * agent's sandbox in cloud / desktop-new-engine mode, the single runtime
     * locally. The dialog's brain picker sends legacy provider/model ids;
     * migrate them to pi ids first. No engine
     * reachable (cloud with no agent open yet) throws — the assist step shows the
     * real reason instead of silently producing an empty agent (HOU-660).
     */
    async generateAgentInstructions(
      description: string,
      opts: { provider?: string; model?: string; signal?: AbortSignal } = {},
    ): Promise<GenerateInstructionsResult> {
      const engine = this.ctx.providerEngine();
      if (!engine)
        throw new Error("Open an agent first, then try Create with AI again.");
      let provider: string | undefined;
      let model = opts.model;
      if (opts.provider) {
        const migrated = migrateProviderModel(opts.provider, opts.model);
        for (const d of migrated.diagnostics)
          console.warn(
            `[engine-adapter] migrated generate model: ${d.message}`,
          );
        provider = migrated.provider;
        model = migrated.model;
      }
      const r = await engine.generateAgent(description, {
        provider,
        model,
        signal: opts.signal,
      });
      return {
        name: r.name,
        instructions: r.instructions,
        suggestedIntegrations: r.suggestedIntegrations.map((slug) => ({
          slug: slug.toLowerCase(),
          displayName: slug,
        })),
        suggestedRoutine: r.suggestedRoutine ?? null,
      };
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
