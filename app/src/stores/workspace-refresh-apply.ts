import { setActiveOrg } from "../lib/engine";
import { queryClient } from "../lib/query-client";
import { resetCacheForSpaceChange } from "../lib/space-cache";
import { orgSlugFromWorkspaceId } from "../lib/space-id";
import { tauriPreferences } from "../lib/tauri";
import type { Workspace } from "../lib/types";
import type { SpacesRefreshPlan } from "../lib/workspace-refresh";

/**
 * Apply a `planSpacesRefresh` plan to the workspace store — the one place the
 * "a space vanished from under the user" merge turns into store + gateway side
 * effects, shared by the background live-spaces refresh (the user was removed
 * from a team) and a delete the user drove themselves (PRODUCT-1410).
 *
 * `reselect` (the active space is gone) re-pins exactly like `setCurrent`:
 * persists the landing space, re-points the gateway (`x-houston-org` + the
 * event stream's `?org=`) and drops the space-scoped query cache. Staying
 * pinned to a space the gateway now 403s/404s would strand every request.
 */
export function applyRefreshPlan(
  plan: SpacesRefreshPlan,
  set: (patch: { workspaces: Workspace[]; current: Workspace | null }) => void,
): void {
  if (plan.kind === "unchanged") return;
  set({ workspaces: plan.workspaces, current: plan.current });
  if (plan.kind === "reselect" && plan.current) {
    tauriPreferences.set("last_workspace_id", plan.current.id);
    const orgChanged = setActiveOrg(orgSlugFromWorkspaceId(plan.current.id));
    resetCacheForSpaceChange(queryClient, orgChanged);
  }
}
