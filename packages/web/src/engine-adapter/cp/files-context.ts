import type { Workspace } from "../../../../../ui/engine-client/src/types";
import { agentPath, type ControlPlaneConfig, cpFetch } from "./fetch";

export async function listWorkspaces(
  cfg: ControlPlaneConfig,
): Promise<Workspace[]> {
  const res = await cpFetch(cfg, "/v1/workspaces");
  return (await res.json()) as Workspace[];
}

// Raw .houston/** doc read/write — what the desktop UI's files-first data layer
// (readAgentJson/writeAgentJson) uses for the board, config, and learnings.
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
 * Workspace + user context (HOU-711) — gateway-TERMINATED, Supabase-backed, NOT
 * proxied to a pod: the two markdown blobs the Settings screen edits. `kind`
 * picks the resource — `workspace` is org-wide (manager-write), `user` is the
 * caller's own. The gateway splices both into each chat turn's prompt, so the
 * cloud path never writes them to the agent volume (unlike the local file path).
 */
export async function getContext(
  cfg: ControlPlaneConfig,
  kind: "workspace" | "user",
): Promise<string> {
  const res = await cpFetch(cfg, `/v1/${kind}-context`);
  return ((await res.json()) as { content: string }).content;
}
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
 * Composer attachments. Upload the dropped files INTO the agent's workspace —
 * its durable, Files-tab-visible `uploads/` folder — so the runtime's clamped
 * file tools can Read them during this turn and any later conversation
 * (HOU-706), and return the RELATIVE workspace paths the host stored them at —
 * which the sender encodes verbatim into the message ("Read these attached
 * files: …"). Binary rides as base64 JSON (the host writes the bytes through
 * its Vfs); the agent resolves each path against its workspace root.
 *
 * `scopeId` is legacy: current hosts ignore it, but engine pods that predate
 * the durable-uploads layout still 400 without it — keep sending it until no
 * pre-HOU-706 pod remains.
 */
export async function saveAttachments(
  cfg: ControlPlaneConfig,
  agentId: string,
  scopeId: string,
  files: readonly File[],
): Promise<string[]> {
  // One request per file: bounds each request to the client's per-file limit,
  // so a multi-file drop can't blow past the host's per-request upload cap
  // (the host dedupes against the scope's existing files across requests).
  const paths: string[] = [];
  for (const f of files) {
    const payload = {
      scopeId,
      files: [
        {
          name: f.name,
          contentBase64: bytesToBase64(new Uint8Array(await f.arrayBuffer())),
        },
      ],
    };
    const res = await cpFetch(cfg, `${agentPath(agentId)}/attachments`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    paths.push(...((await res.json()) as { paths: string[] }).paths);
  }
  return paths;
}

/** Base64-encode bytes without blowing the call stack on large files (chunked btoa). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function getPreference(
  cfg: ControlPlaneConfig,
  key: string,
): Promise<string | null> {
  const res = await cpFetch(cfg, `/v1/preferences/${encodeURIComponent(key)}`);
  return ((await res.json()) as { value: string | null }).value;
}
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
