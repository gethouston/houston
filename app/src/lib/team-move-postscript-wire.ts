import type { SidebarLayout } from "@houston/engine-adapter";
import { useAgentStore } from "../stores/agents.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { logAndReportError } from "./error-report.ts";
import { queryClient } from "./query-client.ts";
import { queryKeys } from "./query-keys.ts";
import { orgSlugFromWorkspaceId } from "./space-id.ts";
import { tauriSidebar } from "./tauri.ts";
import { writeTeamMoveLayout } from "./team-move-layout-write.ts";

function workspaceForSlug(slug: string) {
  const workspace = useWorkspaceStore
    .getState()
    .workspaces.find((item) => orgSlugFromWorkspaceId(item.id) === slug);
  if (!workspace) throw new Error("target workspace not found");
  return workspace;
}

export function teamMovePostscriptWire() {
  return {
    targetWorkspaceId: async (slug: string) => {
      await useWorkspaceStore.getState().loadWorkspaces();
      return workspaceForSlug(slug).id;
    },
    getLayout: (id: string) =>
      queryClient.ensureQueryData({
        queryKey: queryKeys.sidebarLayout(id),
        queryFn: () => tauriSidebar.getLayout(id),
      }),
    updateLayout: (id: string, op: (layout: SidebarLayout) => SidebarLayout) =>
      writeTeamMoveLayout(
        queryClient,
        id,
        op,
        (layout) => tauriSidebar.setLayout(id, layout),
        logAndReportError,
      ),
    switchTarget: async (slug: string) => {
      await useWorkspaceStore.getState().loadWorkspaces();
      const workspace = workspaceForSlug(slug);
      useWorkspaceStore.getState().setCurrent(workspace);
      await useAgentStore.getState().loadAgents(workspace.id);
    },
  };
}
