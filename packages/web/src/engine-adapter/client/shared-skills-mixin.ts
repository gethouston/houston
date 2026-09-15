import type {
  CreateSkillRequest,
  SaveSkillRequest,
  SkillDetail,
} from "../../../../../ui/engine-client/src/types";
import { emitLocalEcho } from "../bus";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/** The path `sdk.skills.shared` builds, which {@link viaSdk} is told about. */
function sharedSkillsPath(wireWorkspaceId: string, slug?: string): string {
  const library = `/v1/workspaces/${encodeURIComponent(wireWorkspaceId)}/shared-skills`;
  return slug === undefined
    ? library
    : `${library}/${encodeURIComponent(slug)}`;
}

/**
 * The workspace-shared skill library, delegated to `sdk.skills.shared`. Nothing
 * here degrades: the host answers every one of these routes, so a 404 is a real
 * failure (an unknown workspace, an unknown slug) and reaches the caller.
 */
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
