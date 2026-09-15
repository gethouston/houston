import type {
  CreateSkillRequest,
  SaveSkillRequest,
  SkillDetail,
} from "../../../../../ui/engine-client/src/types";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

/**
 * An agent's own skills — the procedures it can follow (`cp/skills.ts`).
 * Workspace-wide skills are {@link SharedSkillsMixin}; installing someone
 * else's is {@link MarketplaceMixin}.
 *
 * Skill mutations route to the host (cloud); standalone web has no skill
 * backend, so they no-op there (the UI still navigates).
 */
export function SkillsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Skills extends Base {
    async listSkills(agentPath: string) {
      if (this.ctx.cp) return controlPlane.listSkills(this.ctx.cp, agentPath);
      return [];
    }
    async loadSkill(agentPath: string, name: string): Promise<SkillDetail> {
      if (this.ctx.cp)
        return controlPlane.loadSkill(this.ctx.cp, agentPath, name);
      // Standalone web has no skill backend (nothing is listed), so this is
      // unreachable; return an empty detail rather than crash if it ever isn't.
      return { name, title: null, description: "", version: 1, content: "" };
    }
    async createSkill(req: CreateSkillRequest): Promise<void> {
      if (!this.ctx.cp) return;
      await controlPlane.createSkill(this.ctx.cp, req.workspacePath, {
        name: req.name,
        description: req.description,
        content: req.content,
      });
      emitLocalEcho("SkillsChanged", { agentPath: req.workspacePath });
    }
    async saveSkill(name: string, req: SaveSkillRequest): Promise<void> {
      if (!this.ctx.cp) return;
      await controlPlane.saveSkill(
        this.ctx.cp,
        req.workspacePath,
        name,
        req.content,
      );
      emitLocalEcho("SkillsChanged", { agentPath: req.workspacePath });
    }
    async deleteSkill(workspacePath: string, name: string): Promise<void> {
      if (!this.ctx.cp) return;
      await controlPlane.deleteSkill(this.ctx.cp, workspacePath, name);
      emitLocalEcho("SkillsChanged", { agentPath: workspacePath });
    }
  }
  return Skills;
}
