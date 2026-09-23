import type {
  CreateSkillRequest,
  SaveSkillRequest,
  SkillDetail,
  SkillsManifest,
} from "@houston/wire-types";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * An agent's own skills — the procedures it can follow — and the manifest
 * saying which of them are switched on. Workspace-wide skills are
 * {@link SharedSkillsMixin}; installing someone else's is
 * {@link MarketplaceMixin}.
 *
 * The wire is `sdk.skills.agent` (byte-identical to the control-plane calls it
 * replaced). Skill mutations need the host (cloud); standalone web has no skill
 * backend, so they no-op there (the UI still navigates) — that degradation is
 * the adapter's, never the SDK's, which stays deployment-agnostic.
 */
export function SkillsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Skills extends Base {
    async listSkills(agentPath: string) {
      if (this.ctx.cp)
        return viaSdk(`${controlPlane.agentPath(agentPath)}/skills`, () =>
          this.ctx.sdk.skills.agent.listSkills(agentPath),
        );
      return [];
    }
    async loadSkill(agentPath: string, name: string): Promise<SkillDetail> {
      if (this.ctx.cp)
        return viaSdk(
          `${controlPlane.agentPath(agentPath)}/skills/${encodeURIComponent(name)}`,
          () => this.ctx.sdk.skills.agent.loadSkill(agentPath, name),
        );
      // Standalone web has no skill backend (nothing is listed), so this is
      // unreachable; return an empty detail rather than crash if it ever isn't.
      return { name, title: null, description: "", version: 1, content: "" };
    }
    async createSkill(req: CreateSkillRequest): Promise<void> {
      if (!this.ctx.cp) return;
      await viaSdk(`${controlPlane.agentPath(req.workspacePath)}/skills`, () =>
        this.ctx.sdk.skills.agent.createSkill(req.workspacePath, {
          name: req.name,
          description: req.description,
          content: req.content,
        }),
      );
      emitLocalEcho("SkillsChanged", { agentPath: req.workspacePath });
    }
    async saveSkill(name: string, req: SaveSkillRequest): Promise<void> {
      if (!this.ctx.cp) return;
      await viaSdk(
        `${controlPlane.agentPath(req.workspacePath)}/skills/${encodeURIComponent(name)}`,
        () =>
          this.ctx.sdk.skills.agent.saveSkill(
            req.workspacePath,
            name,
            req.content,
          ),
      );
      emitLocalEcho("SkillsChanged", { agentPath: req.workspacePath });
    }
    async deleteSkill(workspacePath: string, name: string): Promise<void> {
      if (!this.ctx.cp) return;
      await viaSdk(
        `${controlPlane.agentPath(workspacePath)}/skills/${encodeURIComponent(name)}`,
        () => this.ctx.sdk.skills.agent.deleteSkill(workspacePath, name),
      );
      emitLocalEcho("SkillsChanged", { agentPath: workspacePath });
    }

    // ---- the manifest: which of this agent's skills are switched on ----
    // Agent-scoped like everything above, so it lives here rather than with the
    // workspace-wide shared library it enables entries from.
    async getSkillsManifest(agentPath: string): Promise<SkillsManifest> {
      if (!this.ctx.cp) throw new Error("Skills manifests need a host agent.");
      return viaSdk(
        `${controlPlane.agentPath(agentPath)}/skills-manifest`,
        () => this.ctx.sdk.skills.agent.getSkillsManifest(agentPath),
      );
    }
    async putSkillsManifest(
      agentPath: string,
      manifest: SkillsManifest,
    ): Promise<SkillsManifest> {
      if (!this.ctx.cp) throw new Error("Skills manifests need a host agent.");
      const saved = await viaSdk(
        `${controlPlane.agentPath(agentPath)}/skills-manifest`,
        () => this.ctx.sdk.skills.agent.putSkillsManifest(agentPath, manifest),
      );
      emitLocalEcho("SkillsChanged", { agentPath });
      return saved;
    }
  }
  return Skills;
}
