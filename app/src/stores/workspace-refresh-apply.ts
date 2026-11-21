import { forgetAssistantAddresses } from "../lib/assistant-address-cache";
import { setActiveOrg } from "../lib/engine";
import { queryClient } from "../lib/query-client";
import { resetCacheForSpaceChange } from "../lib/space-cache";
import { orgSlugFromWorkspaceId } from "../lib/space-id";
import { tauriPreferences } from "../lib/tauri";
import type { Workspace } from "../lib/types";
import type { SpacesRefreshPlan } from "../lib/workspace-refresh";

export function applyRefreshPlan(
  plan: SpacesRefreshPlan,
  set: (patch: { workspaces: Workspace[]; current: Workspace | null }) => void,
): void {
  if (plan.kind === "unchanged") return;
  set({ workspaces: plan.workspaces, current: plan.current });
  forgetAssistantAddresses(
    queryClient,
    plan.workspaces.map((w) => w.id),
  );
  if (plan.kind === "reselect" && plan.current) {
    void tauriPreferences.rememberWorkspace(plan.current.id);
    const orgChanged = setActiveOrg(orgSlugFromWorkspaceId(plan.current.id));
    resetCacheForSpaceChange(queryClient, orgChanged);
  }
}
