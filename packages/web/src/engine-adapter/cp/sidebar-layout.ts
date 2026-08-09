import type { SidebarLayout } from "../../../../../ui/engine-client/src/types";
import { type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * The sidebar's per-workspace order + grouping, as the OPEN host persists it
 * (`GET`/`PUT /v1/workspaces/:id/sidebar-layout`, stored as the `sidebar_layout`
 * preference). Host-backed rather than device-local because the PUT is what
 * drives the host's `GROUP.md` fan-out: a team's shared context only reaches an
 * agent's system prompt if the layout carrying it was written HERE.
 *
 * `workspaceId` must be the SERVER's id, never the client's synthetic "default"
 * — see `client/wire-workspace-id.ts`.
 */
const layoutPath = (workspaceId: string) =>
  `/v1/workspaces/${encodeURIComponent(workspaceId)}/sidebar-layout`;

export async function getHostSidebarLayout(
  cfg: ControlPlaneConfig,
  workspaceId: string,
): Promise<SidebarLayout> {
  const res = await cpFetch(cfg, layoutPath(workspaceId));
  return (await res.json()) as SidebarLayout;
}

/** Persist a layout and return the host's stored copy (its strict validator
 *  echoes exactly what it wrote, so the caller adopts the canonical shape). */
export async function putHostSidebarLayout(
  cfg: ControlPlaneConfig,
  workspaceId: string,
  layout: SidebarLayout,
): Promise<SidebarLayout> {
  const res = await cpFetch(cfg, layoutPath(workspaceId), {
    method: "PUT",
    body: JSON.stringify(layout),
  });
  return (await res.json()) as SidebarLayout;
}
