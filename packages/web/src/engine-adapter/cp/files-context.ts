import type { Workspace } from "../../../../../ui/engine-client/src/types";
import { agentPath, type ControlPlaneConfig, cpFetch } from "./fetch";

/**
 * Lists the workspaces the user can open.
 * @assistant group:workspaces
 */
export async function listWorkspaces(
  cfg: ControlPlaneConfig,
): Promise<Workspace[]> {
  const res = await cpFetch(cfg, "/v1/workspaces");
  return (await res.json()) as Workspace[];
}

// Raw .houston/** doc read/write — what the desktop UI's files-first data layer
// (readAgentJson/writeAgentJson) uses for the board, config, and learnings.
/**
 * Reads one of an agent's saved data files.
 * @assistant group:files
 */
export async function readAgentFile(
  cfg: ControlPlaneConfig,
  agentId: string,
  relPath: string,
): Promise<string> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/agentfile/${relPath.split("/").map(encodeURIComponent).join("/")}`,
  );
  return ((await res.json()) as { content: string }).content;
}
/**
 * Replaces the contents of one of an agent's saved data files.
 * @assistant group:files confirm
 */
export async function writeAgentFile(
  cfg: ControlPlaneConfig,
  agentId: string,
  relPath: string,
  content: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `${agentPath(agentId)}/agentfile/${relPath.split("/").map(encodeURIComponent).join("/")}`,
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
 * @assistant group:settings
 * @assistant unroutable: debt: the path interpolates the kind union (/v1/${kind}-context); routable once the extractor accepts a literal-union segment.
 */
export async function getContext(
  cfg: ControlPlaneConfig,
  kind: "workspace" | "user",
): Promise<string> {
  const res = await cpFetch(cfg, `/v1/${kind}-context`);
  return ((await res.json()) as { content: string }).content;
}
/**
 * Replaces the background notes Houston gives an agent on every conversation.
 * @assistant group:settings confirm
 * @assistant unroutable: debt: the path interpolates the kind union (/v1/${kind}-context); routable once the extractor accepts a literal-union segment.
 */
export async function setContext(
  cfg: ControlPlaneConfig,
  kind: "workspace" | "user",
  content: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/${kind}-context`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

/**
 * Reads one of the user's saved preferences.
 * @assistant group:settings hidden: UI plumbing; an untyped key/value store the app reads for its own device settings.
 */
export async function getPreference(
  cfg: ControlPlaneConfig,
  key: string,
): Promise<string | null> {
  const res = await cpFetch(cfg, `/v1/preferences/${encodeURIComponent(key)}`);
  return ((await res.json()) as { value: string | null }).value;
}
/**
 * Changes one of the user's saved preferences.
 * @assistant group:settings hidden: UI plumbing; an open key/value write that can clobber any app setting.
 */
export async function setPreference(
  cfg: ControlPlaneConfig,
  key: string,
  value: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/preferences/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
}
