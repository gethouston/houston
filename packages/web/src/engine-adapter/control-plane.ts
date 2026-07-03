import {
  HoustonEngineClient,
  streamGlobalEvents,
} from "@houston/runtime-client";
import type {
  Activity,
  ActivityUpdate,
  Agent,
  CustomEndpoint,
  NewActivity,
  Routine,
  RoutineRun,
  SkillSummary,
  Workspace,
} from "../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "./client";
import { DEFAULT_AGENT_COLOR, DEFAULT_AGENT_CONFIG_ID } from "./synthetic";

/**
 * Control-plane mode for the web adapter.
 *
 * In cloud, the web app talks to the Houston control plane (not a single local
 * runtime). Agents are REAL — the user's personal workspace, served by
 * `GET/POST/PATCH/DELETE /agents` — and a conversation is proxied to that agent's
 * sandbox via `/agents/:id/conversations/:cid/*`, which mirrors the runtime's own
 * wire contract. So chat reuses the exact same `HoustonEngineClient` + `streamTurn`
 * path; we just point the client at `${baseUrl}/agents/${agentId}`.
 *
 * Auth is the caller's Supabase access token (the control plane verifies it).
 */
export interface ControlPlaneConfig {
  baseUrl: string;
  token: string;
}

/** What the control plane returns for an agent (id + name + workspace + ts). */
interface CpAgent {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: number;
  assigned?: boolean;
  assignedUserIds?: string[];
}

// Color is a client-side cosmetic the control plane intentionally does not store
// (its model is id/name only). Keep a tiny local overlay so the UI's per-agent
// color survives reloads without bloating the server model.
const COLOR_KEY = "houston.web.cp.agentColors";
function colorOverlay(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(COLOR_KEY) || "{}") as Record<
      string,
      string
    >;
  } catch {
    return {};
  }
}
function writeOverlay(overlay: Record<string, string>): void {
  try {
    localStorage.setItem(COLOR_KEY, JSON.stringify(overlay));
  } catch {
    /* storage disabled — color just falls back to the default */
  }
}
function setColor(agentId: string, color: string): void {
  writeOverlay({ ...colorOverlay(), [agentId]: color });
}
function moveColor(fromId: string, toId: string): void {
  writeOverlay(renameColorOverlay(colorOverlay(), fromId, toId));
}
function clearColor(agentId: string): void {
  writeOverlay(removeColorOverlay(colorOverlay(), agentId));
}

/**
 * Carry an agent's overlay color from its old id to its new one. The local store
 * derives an agent's id from its on-disk path (`<Workspace>/<Name>`), so renaming
 * an agent changes its id; without this the renamed agent's avatar silently
 * reverts to the default color. No-op when the id is unchanged (stable-id
 * servers) or the agent had no color. Pure so it can be unit-tested without
 * localStorage.
 */
export function renameColorOverlay(
  overlay: Record<string, string>,
  fromId: string,
  toId: string,
): Record<string, string> {
  if (fromId === toId) return overlay;
  const color = overlay[fromId];
  if (color === undefined) return overlay;
  const next: Record<string, string> = {};
  for (const [id, c] of Object.entries(overlay)) {
    if (id !== fromId) next[id] = c;
  }
  next[toId] = color;
  return next;
}

/**
 * Drop an agent's overlay entry on delete, so a future agent that reuses the same
 * path-derived id can't inherit a dead color. No-op when absent. Pure.
 */
export function removeColorOverlay(
  overlay: Record<string, string>,
  id: string,
): Record<string, string> {
  if (!(id in overlay)) return overlay;
  const next: Record<string, string> = {};
  for (const [k, c] of Object.entries(overlay)) {
    if (k !== id) next[k] = c;
  }
  return next;
}

function toUiAgent(a: CpAgent, colors = colorOverlay()): Agent {
  const iso = new Date(a.createdAt).toISOString();
  return {
    id: a.id,
    name: a.name,
    folderPath: a.id, // the agent id IS the chat route key: /agents/${id}/conversations/...
    configId: DEFAULT_AGENT_CONFIG_ID,
    color: colors[a.id] ?? DEFAULT_AGENT_COLOR,
    createdAt: iso,
    lastOpenedAt: iso,
    assigned: a.assigned,
    assignedUserIds: a.assignedUserIds,
  };
}

/**
 * The current control-plane bearer: the live Supabase access token off the
 * engine global (kept in sync with auth state by CloudApp), falling back to the
 * token captured at construction. Read per request so a silent token refresh is
 * picked up without rebuilding the client.
 */
export function liveToken(fallback: string): string {
  if (typeof window !== "undefined" && window.__HOUSTON_ENGINE__) {
    return window.__HOUSTON_ENGINE__.token;
  }
  return fallback;
}

async function cpFetch(
  cfg: ControlPlaneConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${liveToken(cfg.token)}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    // Surface the real failure (auth, not-found, server) — never swallow.
    const body = await res.json().catch(() => ({}));
    throw new HoustonEngineError(res.status, body);
  }
  return res;
}

export async function listAgents(cfg: ControlPlaneConfig): Promise<Agent[]> {
  const res = await cpFetch(cfg, "/agents");
  const colors = colorOverlay();
  return ((await res.json()) as CpAgent[]).map((a) => toUiAgent(a, colors));
}

export async function createAgent(
  cfg: ControlPlaneConfig,
  name: string,
  color?: string,
): Promise<Agent> {
  const res = await cpFetch(cfg, "/agents", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  const agent = (await res.json()) as CpAgent;
  if (color) setColor(agent.id, color);
  return toUiAgent(agent);
}

export async function renameAgent(
  cfg: ControlPlaneConfig,
  agentId: string,
  name: string,
): Promise<Agent> {
  const res = await cpFetch(cfg, `/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  const renamed = (await res.json()) as CpAgent;
  // The local store derives an agent's id from its on-disk path, so a rename
  // changes the id. Carry the color overlay across to the new id or the avatar
  // reverts to the default color.
  moveColor(agentId, renamed.id);
  return toUiAgent(renamed);
}

/** Color is overlay-only; the server agent is unchanged. Returns the updated view. */
export async function updateAgentColor(
  cfg: ControlPlaneConfig,
  agentId: string,
  color: string,
): Promise<Agent> {
  setColor(agentId, color);
  const res = await cpFetch(cfg, "/agents");
  const found = ((await res.json()) as CpAgent[]).find((a) => a.id === agentId);
  if (!found)
    throw new HoustonEngineError(404, {
      error: { message: "agent not found" },
    });
  return toUiAgent(found);
}

export async function deleteAgent(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<void> {
  await cpFetch(cfg, `/agents/${encodeURIComponent(agentId)}`, {
    method: "DELETE",
  });
  clearColor(agentId);
}

/**
 * Connect-once: after a device-code connect lands on one agent, capture its
 * credential into the workspace's central store so every agent (existing + new)
 * shares the connection. Idempotent; safe to call on each successful connect.
 */
export async function captureCredential(
  cfg: ControlPlaneConfig,
  agentId: string,
  provider?: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/credential/capture`,
    {
      method: "POST",
      ...(provider ? { body: JSON.stringify({ provider }) } : {}),
    },
  );
}

/**
 * Connect-once logout: forget the workspace's central credential for a provider,
 * the mirror of captureCredential. Without it, logout cleared only the agent
 * runtime's local auth.json and the next turn re-served the credential from the
 * central store — so the provider reconnected itself. Idempotent.
 */
export async function forgetCredential(
  cfg: ControlPlaneConfig,
  agentId: string,
  provider: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/credential/forget`,
    {
      method: "POST",
      body: JSON.stringify({ provider }),
    },
  );
}

/**
 * Connect an API-key provider (OpenCode Zen / Go): submit the pasted key, which
 * the host stores centrally for the workspace and pushes into the agent runtime.
 * No OAuth dance, no polling — it returns once the key is accepted.
 */
export async function setApiKey(
  cfg: ControlPlaneConfig,
  agentId: string,
  provider: string,
  apiKey: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/credential/api-key`,
    {
      method: "POST",
      body: JSON.stringify({ provider, apiKey }),
    },
  );
}

/**
 * Connect an OpenAI-compatible (local) server: the host forwards the endpoint
 * (base URL + model + optional key) to the agent's standing runtime, which
 * persists it. LOCAL-only — a non-local deployment 400s on the openaiCompatible
 * capability, and cpFetch throws the host's error message.
 */
export async function setCustomEndpoint(
  cfg: ControlPlaneConfig,
  agentId: string,
  endpoint: CustomEndpoint,
): Promise<void> {
  await cpFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/provider/openai-compatible`,
    {
      method: "POST",
      body: JSON.stringify(endpoint),
    },
  );
}

/**
 * A runtime client scoped to ONE agent, via the control plane's transparent proxy.
 * Its `/conversations/:id/*` calls land on `${baseUrl}/agents/${agentId}/conversations/:id/*`.
 */
export function runtimeClientFor(
  cfg: ControlPlaneConfig,
  agentId: string,
): HoustonEngineClient {
  return new HoustonEngineClient({
    baseUrl: `${cfg.baseUrl}/agents/${encodeURIComponent(agentId)}`,
    token: liveToken(cfg.token) || undefined,
  });
}

// --- The typed .houston families, now served REALLY by the host (P3). The list
// routes return `{ items, diagnostics }`; the UI wants bare arrays. ---

const agentPath = (id: string) => `/agents/${encodeURIComponent(id)}`;

export async function listActivities(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<Activity[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/activities`);
  return ((await res.json()) as { items: Activity[] }).items;
}
export async function createActivity(
  cfg: ControlPlaneConfig,
  agentId: string,
  input: NewActivity,
): Promise<Activity> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/activities`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return (await res.json()) as Activity;
}
export async function updateActivity(
  cfg: ControlPlaneConfig,
  agentId: string,
  id: string,
  updates: ActivityUpdate,
): Promise<Activity> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/activities/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
  );
  return (await res.json()) as Activity;
}
export async function deleteActivity(
  cfg: ControlPlaneConfig,
  agentId: string,
  id: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `${agentPath(agentId)}/activities/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export async function listRoutines(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<Routine[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/routines`);
  return ((await res.json()) as { items: Routine[] }).items;
}
export async function listRoutineRuns(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<RoutineRun[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/routine_runs`);
  return ((await res.json()) as { items: RoutineRun[] }).items;
}

export async function listSkills(
  cfg: ControlPlaneConfig,
  agentId: string,
): Promise<SkillSummary[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/skills`);
  const items = (
    (await res.json()) as {
      items: Omit<SkillSummary, "inputs" | "promptTemplate">[];
    }
  ).items;
  // The host dropped the legacy structured-inputs/prompt-template fields (the UI
  // ignores them); restore them as empty so the v1 SkillSummary type is satisfied.
  return items.map((s) => ({ ...s, inputs: [], promptTemplate: null }));
}

export async function createRoutine(
  cfg: ControlPlaneConfig,
  agentId: string,
  input: unknown,
): Promise<Routine> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/routines`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return (await res.json()) as Routine;
}
export async function updateRoutine(
  cfg: ControlPlaneConfig,
  agentId: string,
  id: string,
  updates: unknown,
): Promise<Routine> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/routines/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
  );
  return (await res.json()) as Routine;
}
export async function deleteRoutine(
  cfg: ControlPlaneConfig,
  agentId: string,
  id: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `${agentPath(agentId)}/routines/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

/** Fire a routine immediately — the host records a routine_run and starts the turn now. */
export async function runRoutineNow(
  cfg: ControlPlaneConfig,
  agentId: string,
  id: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `${agentPath(agentId)}/routines/${encodeURIComponent(id)}/run`,
    { method: "POST" },
  );
}

export async function createSkill(
  cfg: ControlPlaneConfig,
  agentId: string,
  body: { name: string; description: string; content: string },
): Promise<void> {
  await cpFetch(cfg, `${agentPath(agentId)}/skills`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
export async function saveSkill(
  cfg: ControlPlaneConfig,
  agentId: string,
  slug: string,
  content: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `${agentPath(agentId)}/skills/${encodeURIComponent(slug)}`,
    {
      method: "PUT",
      body: JSON.stringify({ content }),
    },
  );
}
export async function deleteSkill(
  cfg: ControlPlaneConfig,
  agentId: string,
  slug: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `${agentPath(agentId)}/skills/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
  );
}

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
 * Composer attachments. Upload the dropped files INTO the agent's workspace so
 * the runtime's clamped file tools can Read them during the turn, and return the
 * RELATIVE workspace paths the host stored them at — which the sender encodes
 * verbatim into the message ("Read these attached files: …"). Binary rides as
 * base64 JSON (the host writes the bytes through its Vfs); the agent resolves
 * each path against its workspace root.
 */
export async function saveAttachments(
  cfg: ControlPlaneConfig,
  agentId: string,
  scopeId: string,
  files: readonly File[],
): Promise<string[]> {
  const payload = {
    scopeId,
    files: await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        contentBase64: bytesToBase64(new Uint8Array(await f.arrayBuffer())),
      })),
    ),
  };
  const res = await cpFetch(cfg, `${agentPath(agentId)}/attachments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return ((await res.json()) as { paths: string[] }).paths;
}

export async function deleteAttachments(
  cfg: ControlPlaneConfig,
  agentId: string,
  scopeId: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `${agentPath(agentId)}/attachments?scopeId=${encodeURIComponent(scopeId)}`,
    {
      method: "DELETE",
    },
  );
}

/** Base64-encode bytes without blowing the call stack on large files (chunked btoa). */
function bytesToBase64(bytes: Uint8Array): string {
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

/**
 * Subscribe to the host's global reactivity stream (`GET /v1/events`, SSE).
 *
 * A thin consumer of the shared `streamGlobalEvents` loop
 * (`@houston/runtime-client`), which uses fetch + a ReadableStream reader, NOT
 * `EventSource`: in the Tauri desktop webview a cross-origin `EventSource` to
 * the host silently never connects, so the desktop would get zero reactivity
 * (the board/routines/etc. only refresh on navigation). fetch streaming works
 * in both the webview and the browser — it's the same transport the chat stream
 * already relies on.
 *
 * This adapter keeps only its own two seams: the token rides in the query (the
 * host's bearer reads `?token=`, re-embedded per (re)connect so a refreshed
 * token is always current), and host events `{ type, agentPath, workspaceId }`
 * are translated to the shape the UI's invalidation map reads
 * (`{ type, data: { agent_path, workspace_id } }`). Malformed frames are
 * dropped and the loop reconnects with a short backoff on any drop — including
 * a `401`, which (with no `onUnauthorized` seam) simply reconnects.
 */
export function subscribeEvents(
  cfg: ControlPlaneConfig,
  onEvent: (event: unknown) => void,
): () => void {
  const ac = new AbortController();
  void streamGlobalEvents({
    url: () =>
      `${cfg.baseUrl}/v1/events?token=${encodeURIComponent(liveToken(cfg.token))}`,
    fetch,
    signal: ac.signal,
    onEvent: (data) => {
      const ev = data as {
        type: string;
        agentPath?: string;
        workspaceId?: string;
      };
      onEvent({
        type: ev.type,
        data: { agent_path: ev.agentPath, workspace_id: ev.workspaceId },
      });
    },
  });
  return () => ac.abort();
}

// ── integrations (Composio, platform mode) ───────────────────────────────────
// User-level: no provider account — users only OAuth apps; the platform key
// lives with the host (or its cloud gateway). Types live once in the shared
// engine-client types (re-exported here so callers importing from the adapter
// keep one import site, and the v1 client agrees).

export type {
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
  OrgInfo,
  OrgMember,
  OrgRole,
} from "../../../../ui/engine-client/src/types";

import type {
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
  OrgInfo,
  OrgRole,
} from "../../../../ui/engine-client/src/types";

const integrationPath = (provider: string) =>
  `/v1/integrations/${encodeURIComponent(provider)}`;

export async function integrationStatus(
  cfg: ControlPlaneConfig,
): Promise<IntegrationProviderStatus[]> {
  const res = await cpFetch(cfg, "/v1/integrations");
  return ((await res.json()) as { items: IntegrationProviderStatus[] }).items;
}

export async function setIntegrationSession(
  cfg: ControlPlaneConfig,
  token: string | null,
): Promise<void> {
  try {
    await cpFetch(cfg, "/v1/integrations/session", {
      method: "PUT",
      body: JSON.stringify({ token }),
    });
  } catch (err) {
    // 404 = this deployment has no gateway session sink (the cloud host
    // verifies JWTs itself) — a legitimate shape, not a failure. Anything
    // else (network, 5xx) rethrows and the caller surfaces it.
    if (err instanceof HoustonEngineError && err.status === 404) return;
    throw err;
  }
}

export async function integrationConnection(
  cfg: ControlPlaneConfig,
  provider: string,
  connectionId: string,
): Promise<IntegrationConnection> {
  const res = await cpFetch(
    cfg,
    `${integrationPath(provider)}/connections/${encodeURIComponent(connectionId)}`,
  );
  return (await res.json()) as IntegrationConnection;
}

export async function integrationToolkits(
  cfg: ControlPlaneConfig,
  provider: string,
): Promise<IntegrationToolkit[]> {
  const res = await cpFetch(cfg, `${integrationPath(provider)}/toolkits`);
  return ((await res.json()) as { items: IntegrationToolkit[] }).items;
}

export async function integrationConnections(
  cfg: ControlPlaneConfig,
  provider: string,
): Promise<IntegrationConnection[]> {
  const res = await cpFetch(cfg, `${integrationPath(provider)}/connections`);
  return ((await res.json()) as { items: IntegrationConnection[] }).items;
}

export async function connectIntegration(
  cfg: ControlPlaneConfig,
  provider: string,
  toolkit: string,
): Promise<{ redirectUrl: string; connectionId: string }> {
  const res = await cpFetch(cfg, `${integrationPath(provider)}/connect`, {
    method: "POST",
    body: JSON.stringify({ toolkit }),
  });
  return (await res.json()) as { redirectUrl: string; connectionId: string };
}

export async function disconnectIntegration(
  cfg: ControlPlaneConfig,
  provider: string,
  toolkit: string,
): Promise<void> {
  await cpFetch(cfg, `${integrationPath(provider)}/disconnect`, {
    method: "POST",
    body: JSON.stringify({ toolkit }),
  });
}

export async function dismissIntegrationsReconnectNotice(
  cfg: ControlPlaneConfig,
): Promise<void> {
  await cpFetch(cfg, "/v1/integrations/reconnect-notice/dismiss", {
    method: "POST",
  });
}

// ── org / roles + per-agent grants (multiplayer) ─────────────────────────────
// Hosted-gateway only. The v1 client mirrors these for shim parity.

export async function getOrg(cfg: ControlPlaneConfig): Promise<OrgInfo> {
  const res = await cpFetch(cfg, "/v1/org");
  return (await res.json()) as OrgInfo;
}

export async function addOrgMember(
  cfg: ControlPlaneConfig,
  email: string,
  role: OrgRole,
): Promise<void> {
  await cpFetch(cfg, "/v1/org/members", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export async function removeOrgMember(
  cfg: ControlPlaneConfig,
  userId: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/org/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

export async function setOrgMemberRole(
  cfg: ControlPlaneConfig,
  userId: string,
  role: OrgRole,
): Promise<void> {
  await cpFetch(cfg, `/v1/org/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function setAgentAssignments(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
  userIds: string[],
): Promise<void> {
  await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/assignments`,
    { method: "PUT", body: JSON.stringify({ userIds }) },
  );
}

export async function agentIntegrationGrants(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
): Promise<string[]> {
  const res = await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/integration-grants`,
  );
  return ((await res.json()) as { toolkits: string[] }).toolkits;
}

export async function setAgentIntegrationGrants(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
  toolkits: string[],
): Promise<void> {
  await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/integration-grants`,
    { method: "PUT", body: JSON.stringify({ toolkits }) },
  );
}
