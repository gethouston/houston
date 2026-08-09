import type {
  SidebarLayout,
  Workspace,
} from "../../../../../ui/engine-client/src/types";
import {
  listWorkspaces as cpListWorkspaces,
  retryTransientRead,
} from "../control-plane";
import { syntheticWorkspace } from "../synthetic";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { SidebarLayoutStore } from "./sidebar-layout-store";

export function WorkspacesMixin<TBase extends BaseCtor>(Base: TBase) {
  class Workspaces extends Base {
    #sidebarLayout: SidebarLayoutStore | undefined;
    async listWorkspaces(): Promise<Workspace[]> {
      const { provider, model } = await this.ctx.activeOld();
      const personal = syntheticWorkspace(provider, model);
      // C8 §Workspaces bridge: the host returns one row per membership — a
      // personal row plus one `org:<slug>` row per team. The synthetic
      // personal row REPLACES the served one (its "default" id is load-bearing
      // for prefs, caches, and the desktop boot path); ONLY the `org:*` team
      // rows bridge through, so a local/self-host list (never `org:`-prefixed)
      // stays byte-identical. `prefConfig()` is the shared seam: the gateway
      // in cloud mode, the local host otherwise.
      //
      // A 404 is CAPABILITY negotiation, not a failure: a host that predates
      // the surface has no teams to bridge, so personal-only is the honest and
      // complete answer.
      //
      // Every other failure THROWS (HOU-981). The old blanket
      // `catch { return [personal] }` turned one transient gateway blip into a
      // silent, session-long lie: a Teams user's `org:*` spaces vanished,
      // `resolveActiveWorkspace` fell back to personal, and every mission they
      // owned looked gone. A throw lands on the workspace store's `loadError`
      // — a visible failed state with a retry (plus the `call()` toast) — and
      // leaves the persisted `last_workspace_id` untouched, so the next
      // successful load restores the right space.
      try {
        const rows = await retryTransientRead(() =>
          cpListWorkspaces(this.ctx.prefConfig()),
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
    // Sidebar order + grouping. Host-backed wherever the host serves the route
    // (desktop sidecar + self-host) — that PUT is what triggers the host's
    // GROUP.md fan-out, so a team's shared context actually reaches its agents —
    // and device-local on the gateway-fronted cloud, which does not serve it.
    // The whole policy (predicate, one-time lift, 404 degrade) lives in
    // `sidebar-layout-store.ts`.
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
