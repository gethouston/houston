import type {
  SidebarLayout,
  Workspace,
} from "../../../../../ui/engine-client/src/types";
import { syntheticWorkspace } from "../synthetic";
import type { BaseCtor } from "./mixin";

const SIDEBAR_LAYOUT_PREF = "houston.sidebar-layout";
const EMPTY_SIDEBAR_LAYOUT: SidebarLayout = {
  groups: [],
  ungroupedOrder: [],
};

/** Pure-local (no control plane) sidebar-layout persistence, mirroring how this
 *  adapter keeps other preferences in `localStorage`. */
function readLocalSidebarLayout(workspaceId: string): SidebarLayout {
  try {
    const raw = localStorage.getItem(`${SIDEBAR_LAYOUT_PREF}.${workspaceId}`);
    return raw ? (JSON.parse(raw) as SidebarLayout) : EMPTY_SIDEBAR_LAYOUT;
  } catch {
    return EMPTY_SIDEBAR_LAYOUT;
  }
}
function writeLocalSidebarLayout(workspaceId: string, layout: SidebarLayout) {
  try {
    localStorage.setItem(
      `${SIDEBAR_LAYOUT_PREF}.${workspaceId}`,
      JSON.stringify(layout),
    );
  } catch {
    /* storage disabled */
  }
}

export function WorkspacesMixin<TBase extends BaseCtor>(Base: TBase) {
  class Workspaces extends Base {
    async listWorkspaces(): Promise<Workspace[]> {
      const { provider, model } = await this.ctx.activeOld();
      console.info("[engine-adapter] listWorkspaces -> 1 synthetic workspace");
      return [syntheticWorkspace(provider, model)];
    }
    async createWorkspace(req: { name?: string }): Promise<Workspace> {
      const { provider, model } = await this.ctx.activeOld();
      return {
        ...syntheticWorkspace(provider, model),
        name: req?.name || "Personal",
      };
    }
    async renameWorkspace(): Promise<Workspace> {
      const { provider, model } = await this.ctx.activeOld();
      return syntheticWorkspace(provider, model);
    }
    async deleteWorkspace(): Promise<void> {}
    async setWorkspaceLocale(
      _id: string,
      locale: string | null,
    ): Promise<Workspace> {
      const { provider, model } = await this.ctx.activeOld();
      return { ...syntheticWorkspace(provider, model), locale };
    }
    async setWorkspaceProvider(): Promise<Workspace> {
      const { provider, model } = await this.ctx.activeOld();
      return syntheticWorkspace(provider, model);
    }
    // Sidebar order + grouping is per-workspace UI state, persisted to
    // localStorage exactly like the adapter's other preferences (getPreference).
    // Deliberately NOT host-backed: it must work regardless of the engine's
    // version, and a stale sidecar without the route would otherwise 404 every
    // create-group / drag write.
    async getSidebarLayout(workspaceId: string): Promise<SidebarLayout> {
      return readLocalSidebarLayout(workspaceId);
    }
    async setSidebarLayout(
      workspaceId: string,
      layout: SidebarLayout,
    ): Promise<SidebarLayout> {
      writeLocalSidebarLayout(workspaceId, layout);
      return layout;
    }
  }
  return Workspaces;
}
