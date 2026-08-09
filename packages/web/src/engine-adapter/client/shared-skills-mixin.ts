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
    /**
     * The server's own id for this workspace — the synthetic "default" personal
     * id no server speaks is translated (once per client) by the shared
     * {@link AdapterContext} resolver. See `wire-workspace-id.ts`.
     */
    private wireWorkspaceId(workspaceId: string): Promise<string> {
      return this.ctx.workspaceIds.resolve(workspaceId);
    }

    async listSharedSkills(workspaceId: string) {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      return controlPlane.listSharedSkills(
        this.ctx.cp,
        await this.wireWorkspaceId(workspaceId),
      );
    }

    async loadSharedSkill(
      workspaceId: string,
      slug: string,
    ): Promise<SkillDetail> {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      return controlPlane.loadSharedSkill(
        this.ctx.cp,
        await this.wireWorkspaceId(workspaceId),
        slug,
      );
    }

    async createSharedSkill(
      workspaceId: string,
      req: CreateSkillRequest,
    ): Promise<SkillDetail> {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      const detail = await controlPlane.createSharedSkill(
        this.ctx.cp,
        await this.wireWorkspaceId(workspaceId),
        {
          name: req.name,
          description: req.description,
          content: req.content,
        },
      );
      // Local echoes keep the CLIENT's id vocabulary — query keys are built
      // from the same workspaceId the caller holds.
      emitLocalEcho("SharedSkillsChanged", { workspaceId });
      return detail;
    }

    async promoteSharedSkill(
      workspaceId: string,
      slug: string,
      content: string,
    ): Promise<SkillDetail> {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      const detail = await controlPlane.promoteSharedSkill(
        this.ctx.cp,
        await this.wireWorkspaceId(workspaceId),
        slug,
        content,
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
        await this.wireWorkspaceId(workspaceId),
        slug,
        req.content,
      );
      emitLocalEcho("SharedSkillsChanged", { workspaceId });
    }

    async deleteSharedSkill(workspaceId: string, slug: string): Promise<void> {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      await controlPlane.deleteSharedSkill(
        this.ctx.cp,
        await this.wireWorkspaceId(workspaceId),
        slug,
      );
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
