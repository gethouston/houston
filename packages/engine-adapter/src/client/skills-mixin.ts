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
