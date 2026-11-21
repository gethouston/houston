import type {
  CreateSkillRequest,
  SaveSkillRequest,
  SkillDetail,
} from "@houston/wire-types";
import { emitLocalEcho } from "../bus";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

function sharedSkillsPath(wireWorkspaceId: string, slug?: string): string {
  const library = `/v1/workspaces/${encodeURIComponent(wireWorkspaceId)}/shared-skills`;
  return slug === undefined
    ? library
    : `${library}/${encodeURIComponent(slug)}`;
}

export function SharedSkillsMixin<TBase extends BaseCtor>(Base: TBase) {
  class SharedSkills extends Base {
    private wireWorkspaceId(workspaceId: string): Promise<string> {
      return this.ctx.workspaceIds.resolve(workspaceId);
    }

    async listSharedSkills(workspaceId: string) {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      const wire = await this.wireWorkspaceId(workspaceId);
      return viaSdk(sharedSkillsPath(wire), () =>
        this.ctx.sdk.skills.shared.listSharedSkills(wire),
      );
    }

    async loadSharedSkill(
      workspaceId: string,
      slug: string,
    ): Promise<SkillDetail> {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      const wire = await this.wireWorkspaceId(workspaceId);
      return viaSdk(sharedSkillsPath(wire, slug), () =>
        this.ctx.sdk.skills.shared.loadSharedSkill(wire, slug),
      );
    }

    async createSharedSkill(
      workspaceId: string,
      req: CreateSkillRequest,
    ): Promise<SkillDetail> {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      const wire = await this.wireWorkspaceId(workspaceId);
      const detail = await viaSdk(sharedSkillsPath(wire), () =>
        this.ctx.sdk.skills.shared.createSharedSkill(wire, {
          name: req.name,
          description: req.description,
          content: req.content,
        }),
      );
      emitLocalEcho("SharedSkillsChanged", { workspaceId });
      return detail;
    }

    async promoteSharedSkill(
      workspaceId: string,
      slug: string,
      content: string,
    ): Promise<SkillDetail> {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      const wire = await this.wireWorkspaceId(workspaceId);
      const detail = await viaSdk(sharedSkillsPath(wire, slug), () =>
        this.ctx.sdk.skills.shared.promoteSharedSkill(wire, slug, content),
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
      const wire = await this.wireWorkspaceId(workspaceId);
      await viaSdk(sharedSkillsPath(wire, slug), () =>
        this.ctx.sdk.skills.shared.saveSharedSkill(wire, slug, req.content),
      );
      emitLocalEcho("SharedSkillsChanged", { workspaceId });
    }

    async deleteSharedSkill(workspaceId: string, slug: string): Promise<void> {
      if (!this.ctx.cp) throw new Error("Shared skills need a host workspace.");
      const wire = await this.wireWorkspaceId(workspaceId);
      await viaSdk(sharedSkillsPath(wire, slug), () =>
        this.ctx.sdk.skills.shared.deleteSharedSkill(wire, slug),
      );
      emitLocalEcho("SharedSkillsChanged", { workspaceId });
    }
  }
  return SharedSkills;
}
