import type {
  CommunitySkill,
  CommunitySkillPreview,
  InstallCommunityRequest,
  InstallFromRepoRequest,
  RepoSkill,
} from "@houston/wire-types";
import { emitLocalEcho } from "../bus";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/** The agent-scoped marketplace prefix the gateway proxies to the agent's pod. */
const marketplacePath = (agentPath: string, leaf: string) =>
  `/agents/${encodeURIComponent(agentPath)}/skills/${leaf}`;

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
      return viaSdk(marketplacePath(agentPath, "community/search"), () =>
        this.ctx.sdk.skills.marketplace.searchCommunitySkills(
          agentPath,
          query,
          signal,
        ),
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
      return viaSdk(marketplacePath(agentPath, "community/preview"), () =>
        this.ctx.sdk.skills.marketplace.previewCommunitySkill(
          agentPath,
          source,
          skillId,
          signal,
        ),
      );
    }
    async listSkillsFromRepo(
      agentPath: string,
      source: string,
      signal?: AbortSignal,
    ): Promise<RepoSkill[]> {
      if (!this.ctx.cp) return [];
      return viaSdk(marketplacePath(agentPath, "repo/list"), () =>
        this.ctx.sdk.skills.marketplace.listSkillsFromRepo(
          agentPath,
          source,
          signal,
        ),
      );
    }
    async installCommunitySkill(
      req: InstallCommunityRequest,
      signal?: AbortSignal,
    ): Promise<string> {
      if (!this.ctx.cp)
        throw new Error("Installing skills needs a cloud workspace.");
      const slug = await viaSdk(
        marketplacePath(req.workspacePath, "community/install"),
        () =>
          this.ctx.sdk.skills.marketplace.installCommunitySkill(
            req.workspacePath,
            { source: req.source, skillId: req.skillId },
            signal,
          ),
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
      const installed = await viaSdk(
        marketplacePath(req.workspacePath, "repo/install"),
        () =>
          this.ctx.sdk.skills.marketplace.installSkillsFromRepo(
            req.workspacePath,
            { source: req.source, skills: req.skills },
            signal,
          ),
      );
      emitLocalEcho("SkillsChanged", { agentPath: req.workspacePath });
      return installed;
    }
  }
  return Marketplace;
}
