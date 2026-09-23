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
    /** One skill on or off, leaving the rest of the manifest alone. The SDK
     *  serializes these per agent, so two started together both land. */
    async setSkillEnabled(
      agentPath: string,
      slug: string,
      enabled: boolean,
    ): Promise<SkillsManifest> {
      if (!this.ctx.cp) throw new Error("Skills manifests need a host agent.");
      const saved = await viaSdk(
        `${controlPlane.agentPath(agentPath)}/skills-manifest`,
        () =>
          this.ctx.sdk.skills.agent.setSkillEnabled(agentPath, slug, enabled),
      );
      emitLocalEcho("SkillsChanged", { agentPath });
      return saved;
    }

    // ---- the two composed acts on a WORKSPACE skill ----
    // Each is a manifest write plus the agent's own shadowing copy, and the
    // SDK owns the order they happen in. The adapter only names the route the
    // act starts on and echoes the change, which it does whether or not the
    // act finished: the manifest half can land and the copy delete fail after
    // it, and readers left on the state from before that write have nothing
    // to tell them so. The rejection still reaches the caller.
    /** Back onto the workspace version: the entry on, then the copy dropped. */
    async revertSkillOverride(agentPath: string, slug: string): Promise<void> {
      if (!this.ctx.cp) throw new Error("Skills manifests need a host agent.");
      try {
        await viaSdk(
          `${controlPlane.agentPath(agentPath)}/skills-manifest`,
          () => this.ctx.sdk.skills.agent.revertSkillOverride(agentPath, slug),
        );
      } finally {
        emitLocalEcho("SkillsChanged", { agentPath });
      }
    }
    /** Off this agent: the entry off, then the copy that would still load. */
    async disableSkillForAgent(agentPath: string, slug: string): Promise<void> {
      if (!this.ctx.cp) throw new Error("Skills manifests need a host agent.");
      try {
        await viaSdk(
          `${controlPlane.agentPath(agentPath)}/skills-manifest`,
          () => this.ctx.sdk.skills.agent.disableSkillForAgent(agentPath, slug),
        );
      } finally {
        emitLocalEcho("SkillsChanged", { agentPath });
      }
    }
    /** Throw away an unfinished creation chat: the board's own archive write,
     *  composed in the SDK, so what the surface stops offering to resume and
     *  what the board shows as archived are one change. */
    async discardSkillDraft(
      agentPath: string,
      activityId: string,
    ): Promise<void> {
      if (!this.ctx.cp) throw new Error("Skill drafts need a host agent.");
      await viaSdk(
        `${controlPlane.agentPath(agentPath)}/activities/${encodeURIComponent(activityId)}`,
        () => this.ctx.sdk.skills.discardSkillDraft(agentPath, activityId),
      );
      emitLocalEcho("ActivityChanged", { agentPath });
    }
  }
  return Skills;
}
