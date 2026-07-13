import { migrateProviderModel } from "@houston/domain";
import type {
  Agent,
  CreateAgent,
  CreateAgentResult,
  GenerateInstructionsResult,
  InstalledConfig,
  InstallFromGithub,
  UpdateAgent,
} from "../../../../../ui/engine-client/src/types";
import * as agents from "../agents";
import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

export function AgentsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Agents extends Base {
    async listAgents(workspaceId: string): Promise<Agent[]> {
      if (this.ctx.cp) {
        const list = await controlPlane.listAgents(this.ctx.cp);
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
      if (this.ctx.cp) {
        // Delegate the wire write to the SDK (byte-identical POST /agents with
        // the full `{ name, claudeMd?, seeds? }` body, no refetch). The RETURNED
        // wire agent carries the id the color overlay needs — layer it on and map
        // to the UI shape callers expect.
        const wire = await this.ctx.sdk.agents.writes.create({
          name: req.name,
          claudeMd: req.claudeMd,
          seeds: req.seeds,
        });
        return { agent: controlPlane.createdAgentToUi(wire, req.color) };
      }
      return agents.createAgent(workspaceId, req);
    }
    async renameAgent(
      workspaceId: string,
      agentId: string,
      newName: string,
    ): Promise<Agent> {
      if (this.ctx.cp) {
        // SDK delegates the PATCH /agents/:id write; web carries the color
        // overlay across the (possibly new) id and maps to the UI shape.
        const wire = await this.ctx.sdk.agents.writes.rename(agentId, newName);
        return controlPlane.renamedAgentToUi(agentId, wire);
      }
      return agents.renameAgent(workspaceId, agentId, newName);
    }
    async updateAgent(
      workspaceId: string,
      agentId: string,
      req: UpdateAgent,
    ): Promise<Agent> {
      if (this.ctx.cp)
        return controlPlane.updateAgentColor(this.ctx.cp, agentId, req.color);
      return agents.updateAgentColor(workspaceId, agentId, req.color);
    }
    async deleteAgent(workspaceId: string, agentId: string): Promise<void> {
      if (this.ctx.cp) {
        // SDK delegates the DELETE /agents/:id write; web forgets the deleted
        // agent's color overlay (was cp.deleteAgent's clearColor) after.
        await this.ctx.sdk.agents.writes.delete(agentId);
        controlPlane.clearColor(agentId);
        // The selection pref must not outlive its agent: when the deleted agent
        // was the remembered one (and it was the last — the app re-points the
        // pref otherwise), provider connects must fall back to the setup runtime.
        this.ctx.dropLastAgentPref((id) => id === agentId);
        return;
      }
      agents.deleteAgent(workspaceId, agentId);
    }
    /**
     * Create-with-AI: one one-shot generation turn on the runtime — the selected
     * agent's sandbox in cloud / desktop-new-engine mode (same path as
     * summarizeActivity), the single runtime locally. The dialog's brain picker
     * sends legacy provider/model ids; migrate them to pi ids first. No engine
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
        // Nothing renders these yet on the new engine; keep the wire shape so the
        // create dialog can start consuming them without an adapter change.
        suggestedIntegrations: r.suggestedIntegrations.map((slug) => ({
          slug: slug.toLowerCase(),
          displayName: slug,
        })),
        suggestedRoutine: r.suggestedRoutine ?? null,
      };
    }
    // Agent-config library: templates the user installed (GitHub) that the
    // create-agent picker merges alongside the bundled ones. Standalone web has
    // no host to keep a library — nothing installed there is the honest answer.
    async listInstalledConfigs(): Promise<InstalledConfig[]> {
      if (!this.ctx.cp) return [];
      return controlPlane.listInstalledConfigs(this.ctx.cp);
    }
    async installAgentFromGithub(
      req: InstallFromGithub,
    ): Promise<{ agentId: string }> {
      if (!this.ctx.cp)
        throw new Error("Installing agents needs a cloud workspace.");
      return controlPlane.installAgentFromGithub(this.ctx.cp, req.githubUrl);
    }
  }
  return Agents;
}
