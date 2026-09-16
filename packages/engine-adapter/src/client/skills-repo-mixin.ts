import type { InstallFromRepoRequest, RepoSkill } from "@houston/wire-types";
import { emitLocalEcho } from "../bus";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/** The agent-scoped repo prefix the gateway proxies to the agent's pod. */
const repoPath = (agentPath: string, leaf: string) =>
  `/agents/${encodeURIComponent(agentPath)}/skills/repo/${leaf}`;

export function SkillsRepoMixin<TBase extends BaseCtor>(Base: TBase) {
  // GitHub repo skill discovery + install. Standalone web has no backend for
  // them — listings answer empty (the dialog shows its "unavailable" state),
  // installs refuse loudly rather than no-op.
  class SkillsRepo extends Base {
    async listSkillsFromRepo(
      agentPath: string,
      source: string,
      signal?: AbortSignal,
    ): Promise<RepoSkill[]> {
      if (!this.ctx.cp) return [];
      return viaSdk(repoPath(agentPath, "list"), () =>
        this.ctx.sdk.skills.repo.listSkillsFromRepo(agentPath, source, signal),
      );
    }
    async installSkillsFromRepo(
      req: InstallFromRepoRequest,
      signal?: AbortSignal,
    ): Promise<string[]> {
      if (!this.ctx.cp)
        throw new Error("Installing skills needs a cloud workspace.");
      const installed = await viaSdk(
        repoPath(req.workspacePath, "install"),
        () =>
          this.ctx.sdk.skills.repo.installSkillsFromRepo(
            req.workspacePath,
            { source: req.source, skills: req.skills },
            signal,
          ),
      );
      emitLocalEcho("SkillsChanged", { agentPath: req.workspacePath });
      return installed;
    }
  }
  return SkillsRepo;
}
