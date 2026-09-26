/**
 * The workspaces family's REST calls, over the injected `fetch`.
 *
 * Four capabilities share this module because they share one addressee — the
 * space the user is in: the list of spaces, the raw `.houston/**` docs of an
 * agent inside one, the background notes spliced into every conversation, and
 * the person's sidebar folder arrangement.
 *
 * The runtime client is scoped to ONE conversation and exposes none of them, so
 * this module talks to the host routes directly through `ports.fetch` — auth
 * rides that fetch, exactly as the kernel constructs the runtime client without
 * a token. A non-2xx throws the {@link WorkspacesHttpError} the scope mints; a
 * `401` additionally fires `onUnauthorized`, so a lapsed session becomes a
 * visible `tokenExpired` signal.
 */

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

// Raw .houston/** doc read/write — what the desktop UI's files-first data layer
// (readAgentJson/writeAgentJson) uses for the board, config, and learnings.
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
 * Reads the background notes Houston gives an agent on every conversation.
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
 * Replaces the background notes Houston gives an agent on every conversation.
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

/**
 * The person's per-workspace sidebar folders and order, served by the host or
 * gateway at `GET`/`PUT /v1/workspaces/:id/sidebar-layout`.
 *
 * `workspaceId` must be the SERVER's id — the one `listWorkspaces` answers
 * with, never a client-side synthetic id for the personal space.
 */
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
