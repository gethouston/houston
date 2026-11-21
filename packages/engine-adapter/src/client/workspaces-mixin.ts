import type { SidebarLayout, Workspace } from "@houston/wire-types";
import { prefPath, retryTransientRead } from "../control-plane";
import { syntheticWorkspace } from "../synthetic";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";
import { SidebarLayoutStore } from "./sidebar-layout-store";

const TEAM_WORKSPACE_ID = /^org:([a-f0-9]{16})$/;

export function teamSlugFromWorkspaceId(id: string): string | null {
  const match = TEAM_WORKSPACE_ID.exec(id);
  return match ? match[1] : null;
}

export function WorkspacesMixin<TBase extends BaseCtor>(Base: TBase) {
  class Workspaces extends Base {
    #sidebarLayout: SidebarLayoutStore | undefined;
    async listWorkspaces(): Promise<Workspace[]> {
      const personal = syntheticWorkspace();
      try {
        const rows = await retryTransientRead(() =>
          viaSdk("/v1/workspaces", () =>
            this.ctx.sdk.workspaces.listWorkspaces(),
          ),
        );
        const teams = rows.filter((w) => w.id.startsWith("org:"));
        return [personal, ...teams];
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404) {
          console.info("[workspaces] host serves no team spaces (404)");
          return [personal];
        }
        throw err;
      }
    }
    async createWorkspace(req: { name?: string }): Promise<Workspace> {
      return { ...syntheticWorkspace(), name: req?.name || "Personal" };
    }
    async deleteWorkspace(id: string): Promise<void> {
      const slug = teamSlugFromWorkspaceId(id);
      if (slug === null)
        throw new Error("Your personal workspace can't be deleted.");
      if (!this.ctx.cp)
        throw new Error("Deleting a team needs the hosted gateway.");
      await viaSdk(`/v1/orgs/${encodeURIComponent(slug)}`, () =>
        this.ctx.sdk.spaces.deleteOrg(slug),
      );
    }
    async setWorkspaceLocale(
      _id: string,
      locale: string | null,
    ): Promise<Workspace> {
      await viaSdk(prefPath("locale"), () =>
        this.ctx.sdk.preferences.set("locale", locale),
      );
      return { ...syntheticWorkspace(), locale };
    }
    async setWorkspaceProvider(): Promise<Workspace> {
      return syntheticWorkspace();
    }
    private sidebarLayoutStore(): SidebarLayoutStore {
      this.#sidebarLayout ??= new SidebarLayoutStore(this.ctx);
      return this.#sidebarLayout;
    }
    async getSidebarLayout(workspaceId: string): Promise<SidebarLayout> {
      return this.sidebarLayoutStore().get(workspaceId);
    }
    async setSidebarLayout(
      workspaceId: string,
      layout: SidebarLayout,
    ): Promise<SidebarLayout> {
      return this.sidebarLayoutStore().set(workspaceId, layout);
    }
  }
  return Workspaces;
}
