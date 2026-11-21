import { type HttpScope, httpRequest } from "../http";
import type { SidebarLayout, Workspace } from "./types";

/**
 * Lists the workspaces the user can open.
 * @assistant group:workspaces
 */
export async function listWorkspaces(scope: HttpScope): Promise<Workspace[]> {
  const res = await httpRequest(scope, "/v1/workspaces");
  return (await res.json()) as Workspace[];
}

/**
 * Reads one of an agent's saved data files.
 * @assistant group:files
 */
export async function readAgentFile(
  scope: HttpScope,
  agentId: string,
  relPath: string,
): Promise<string> {
  const res = await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/agentfile/${relPath.split("/").map(encodeURIComponent).join("/")}`,
  );
  return ((await res.json()) as { content: string }).content;
}
/**
 * Replaces the contents of one of an agent's saved data files.
 * @assistant group:files
 * @assistant confirm: irreversible. It replaces the whole file, and what the user had written there is not kept.
 */
export async function writeAgentFile(
  scope: HttpScope,
  agentId: string,
  relPath: string,
  content: string,
): Promise<void> {
  await httpRequest(
    scope,
    `/agents/${encodeURIComponent(agentId)}/agentfile/${relPath.split("/").map(encodeURIComponent).join("/")}`,
    {
      method: "PUT",
      body: JSON.stringify({ content }),
    },
  );
}

/**
 * Reads the background notes given to an agent on every conversation.
 *
 * Workspace + user context (HOU-711) — gateway-TERMINATED, Supabase-backed, NOT
 * proxied to a pod: the two markdown blobs the Settings screen edits. `kind`
 * picks the resource — `workspace` is org-wide (manager-write), `user` is the
 * caller's own. The gateway splices both into each chat turn's prompt, so the
 * cloud path never writes them to the agent volume (unlike the local file path).
 *
 * The kind is ESCAPED into the path, not spliced: that is what makes the route
 * derivable (`/v1/{kind}-context`) and so callable, and it is a no-op on both
 * members of the union.
 * @assistant group:settings
 */
export async function getContext(
  scope: HttpScope,
  kind: "workspace" | "user",
): Promise<string> {
  const res = await httpRequest(
    scope,
    `/v1/${encodeURIComponent(kind)}-context`,
  );
  return ((await res.json()) as { content: string }).content;
}
/**
 * Replaces the background notes given to an agent on every conversation.
 * @assistant group:settings
 * @assistant confirm: outward. These notes ride every later conversation with every agent, and the text they replace is not kept.
 */
export async function setContext(
  scope: HttpScope,
  kind: "workspace" | "user",
  content: string,
): Promise<void> {
  await httpRequest(scope, `/v1/${encodeURIComponent(kind)}-context`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

const layoutPath = (workspaceId: string) =>
  `/v1/workspaces/${encodeURIComponent(workspaceId)}/sidebar-layout`;

/**
 * Reads how a workspace's sidebar is arranged.
 * @assistant group:workspaces hidden: A person's sidebar folders are arranged by drag and drop in the app.
 */
export async function getHostSidebarLayout(
  scope: HttpScope,
  workspaceId: string,
): Promise<SidebarLayout> {
  const res = await httpRequest(scope, layoutPath(workspaceId));
  return (await res.json()) as SidebarLayout;
}

/**
 * Saves how a workspace's sidebar is arranged.
 *
 * Persist a layout and return the host's stored copy (its strict validator
 * echoes exactly what it wrote, so the caller adopts the canonical shape).
 * @assistant group:workspaces hidden: A person's sidebar folders are arranged by drag and drop in the app.
 */
export async function putHostSidebarLayout(
  scope: HttpScope,
  workspaceId: string,
  layout: SidebarLayout,
): Promise<SidebarLayout> {
  const res = await httpRequest(scope, layoutPath(workspaceId), {
    method: "PUT",
    body: JSON.stringify(layout),
  });
  return (await res.json()) as SidebarLayout;
}
