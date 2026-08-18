import type {
  SidebarLayout,
  Workspace,
} from "../../../../../ui/engine-client/src/types";
import {
  listWorkspaces as cpListWorkspaces,
  deleteOrg,
  retryTransientRead,
} from "../control-plane";
import { syntheticWorkspace } from "../synthetic";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { SidebarLayoutStore } from "./sidebar-layout-store";

/** Exactly `org:` + 16 lowercase hex chars — the C8 team-space id grammar. */
const TEAM_WORKSPACE_ID = /^org:([a-f0-9]{16})$/;

/**
 * The org slug behind a team workspace id, or `null` for the personal row (the
 * synthetic "default" or any opaque non-`org:` id). Mirrors the app's
 * `orgSlugFromWorkspaceId` (`app/src/lib/space-id.ts`); the adapter keeps its
 * own copy because `packages/web` never imports from `app/`.
 */
export function teamSlugFromWorkspaceId(id: string): string | null {
  const match = TEAM_WORKSPACE_ID.exec(id);
  return match ? match[1] : null;
}

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
    // Delete a team space (PRODUCT-1410). Only an `org:<slug>` row is
    // deletable, and only through the gateway: the personal workspace is the
    // synthetic row every deployment keeps (a hosted personal space goes away
    // with the account, never on its own), and a local/self-host list holds
    // nothing but that row. Off-cloud, or asked for the personal row, this
    // THROWS — the old empty stub let the UI drop the row locally and call it
    // deleted while the space lived on and re-listed on the next refresh.
    async deleteWorkspace(id: string): Promise<void> {
      const slug = teamSlugFromWorkspaceId(id);
      if (slug === null)
        throw new Error("Your personal workspace can't be deleted.");
      if (!this.ctx.cp)
        throw new Error("Deleting a team needs the hosted gateway.");
      await deleteOrg(this.ctx.cp, slug);
    }
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
