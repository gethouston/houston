import type {
  CreateSkillRequest,
  SaveSkillRequest,
  SkillDetail,
  SkillsManifest,
} from "../../../../../ui/engine-client/src/types";
import { emitLocalEcho } from "../bus";
import * as controlPlane from "../control-plane";
import { DEFAULT_WORKSPACE_ID } from "../synthetic";
import type { BaseCtor } from "./mixin";

export function SharedSkillsMixin<TBase extends BaseCtor>(Base: TBase) {
  class SharedSkills extends Base {
    /** Resolved server-side personal workspace id (see `wireWorkspaceId`). */
    #personalWsId: Promise<string> | undefined;

    /**
     * The workspace id the UI holds for the personal space is the SYNTHETIC
     * "default" (`workspaces-mixin` replaces the served personal row with it;
     * its id is load-bearing for prefs/caches). No server speaks that
     * vocabulary: the local host's personal workspace id is its folder name
     * and the gateway's is its fixed engine id ("Houston") — both 404
     * "workspace not found" for "default". Team spaces (`org:<slug>`) bridge
     * through with their real ids and pass through here untouched. So the
     * personal id is resolved from the server's own `/v1/workspaces` list
     * (the non-`org:` row) and cached for the client's lifetime.
     */
    private wireWorkspaceId(workspaceId: string): Promise<string> {
      if (workspaceId !== DEFAULT_WORKSPACE_ID)
        return Promise.resolve(workspaceId);
      const cp = this.ctx.cp;
      if (!cp) throw new Error("Shared skills need a host workspace.");
      this.#personalWsId ??= (async () => {
        const rows = await controlPlane.listWorkspaces(cp);
        const personal = rows.find((w) => !w.id.startsWith("org:"));
        if (!personal)
          throw new Error("The host serves no personal workspace.");
        return personal.id;
      })();
      // A transient failure must not wedge shared skills for the session:
      // drop the cached rejection so the next call re-resolves.
      return this.#personalWsId.catch((err: unknown) => {
        this.#personalWsId = undefined;
        throw err;
      });
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
