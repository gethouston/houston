import type {
  CreateSkillRequest,
  SaveSkillRequest,
  SkillDetail,
  SkillsManifest,
} from "../../../../../ui/engine-client/src/types";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

export function SharedSkillsMixin<TBase extends BaseCtor>(Base: TBase) {
  class SharedSkills extends Base {
    async listSharedSkills(workspaceId: string) {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      return controlPlane.listSharedSkills(this.ctx.cp, workspaceId);
    }

    async loadSharedSkill(
      workspaceId: string,
      slug: string,
    ): Promise<SkillDetail> {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      return controlPlane.loadSharedSkill(this.ctx.cp, workspaceId, slug);
    }

    async createSharedSkill(
      workspaceId: string,
      req: CreateSkillRequest,
    ): Promise<SkillDetail> {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      const detail = await controlPlane.createSharedSkill(
        this.ctx.cp,
        workspaceId,
        {
          name: req.name,
          description: req.description,
          content: req.content,
        },
      );
      emitLocalEcho("SharedSkillsChanged", { workspaceId });
      return detail;
    }

    async saveSharedSkill(
      workspaceId: string,
      slug: string,
      req: SaveSkillRequest,
    ): Promise<void> {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      await controlPlane.saveSharedSkill(
        this.ctx.cp,
        workspaceId,
        slug,
        req.content,
      );
      emitLocalEcho("SharedSkillsChanged", { workspaceId });
    }

    async deleteSharedSkill(workspaceId: string, slug: string): Promise<void> {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      await controlPlane.deleteSharedSkill(this.ctx.cp, workspaceId, slug);
      emitLocalEcho("SharedSkillsChanged", { workspaceId });
    }

    async getSkillsManifest(agentPath: string): Promise<SkillsManifest> {
      if (!this.ctx.cp) throw new Error("Skills manifests need a host agent.");
      return controlPlane.getSkillsManifest(this.ctx.cp, agentPath);
    }

    async putSkillsManifest(
      agentPath: string,
      manifest: SkillsManifest,
    ): Promise<SkillsManifest> {
      if (!this.ctx.cp) throw new Error("Skills manifests need a host agent.");
      const saved = await controlPlane.putSkillsManifest(
        this.ctx.cp,
        agentPath,
        manifest,
      );
      emitLocalEcho("SkillsChanged", { agentPath });
      return saved;
    }
  }
  return SharedSkills;
}
