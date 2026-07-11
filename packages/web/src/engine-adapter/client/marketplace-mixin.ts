import type {
  CommunitySkill,
  CommunitySkillPreview,
  InstallCommunityRequest,
  InstallFromRepoRequest,
  RepoSkill,
} from "../../../../../ui/engine-client/src/types";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

export function MarketplaceMixin<TBase extends BaseCtor>(Base: TBase) {
  // Marketplace: skills.sh search/install + GitHub repo discovery. Standalone
  // web has no marketplace backend — searches answer empty (the dialog shows
  // its "unavailable" state), installs refuse loudly rather than no-op.
  class Marketplace extends Base {
    async searchCommunitySkills(
      agentPath: string,
      query: string,
      signal?: AbortSignal,
    ): Promise<CommunitySkill[]> {
      if (!this.ctx.cp) return [];
      return controlPlane.searchCommunitySkills(
        this.ctx.cp,
        agentPath,
        query,
        signal,
      );
    }
    async previewCommunitySkill(
      agentPath: string,
      source: string,
      skillId: string,
      signal?: AbortSignal,
    ): Promise<CommunitySkillPreview> {
      if (!this.ctx.cp)
        throw new Error("Previewing skills needs a cloud workspace.");
      return controlPlane.previewCommunitySkill(
        this.ctx.cp,
        agentPath,
        source,
        skillId,
        signal,
      );
    }
    async listSkillsFromRepo(
      agentPath: string,
      source: string,
      signal?: AbortSignal,
    ): Promise<RepoSkill[]> {
      if (!this.ctx.cp) return [];
      return controlPlane.listSkillsFromRepo(
        this.ctx.cp,
        agentPath,
        source,
        signal,
      );
    }
    async installCommunitySkill(
      req: InstallCommunityRequest,
      signal?: AbortSignal,
    ): Promise<string> {
      if (!this.ctx.cp)
        throw new Error("Installing skills needs a cloud workspace.");
      const slug = await controlPlane.installCommunitySkill(
        this.ctx.cp,
        req.workspacePath,
        { source: req.source, skillId: req.skillId },
        signal,
      );
      emitLocalEcho("SkillsChanged", { agentPath: req.workspacePath });
      return slug;
    }
    async installSkillsFromRepo(
      req: InstallFromRepoRequest,
      signal?: AbortSignal,
    ): Promise<string[]> {
      if (!this.ctx.cp)
        throw new Error("Installing skills needs a cloud workspace.");
      const installed = await controlPlane.installSkillsFromRepo(
        this.ctx.cp,
        req.workspacePath,
        { source: req.source, skills: req.skills },
        signal,
      );
      emitLocalEcho("SkillsChanged", { agentPath: req.workspacePath });
      return installed;
    }
  }
  return Marketplace;
}
