import {
  HoustonEngineClient,
  streamGlobalEvents,
} from "@houston/runtime-client";
import type {
  Activity,
  ActivityUpdate,
  Agent,
  CommunitySkill,
  CustomEndpoint,
  InstalledConfig,
  NewActivity,
  RepoSkill,
  Routine,
  RoutineRun,
  SkillDetail,
  SkillSummary,
  TunnelCredentials,
  Workspace,
} from "../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "./client";
import { refreshLiveToken } from "./session-refresh";
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
  /** Absolute on-disk directory — present only when the host is co-located
   * with the files (local profile). Feeds the OS reveal/open commands. */
  dir?: string;
  assigned?: boolean;
  assignedUserIds?: string[];
  /** Teams v2: the caller's effective access to this agent. */
  access?: AgentAccess;
  /** Teams v2: full assignee list with per-person access (managers/owner only). */
  assignments?: AgentAssignment[];
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
    // The REAL directory (local hosts only) — what OS reveal/open needs, since
    // folderPath here is a route key, not a path (HOU-677).
    localDir: a.dir,
    configId: DEFAULT_AGENT_CONFIG_ID,
    color: colors[a.id] ?? DEFAULT_AGENT_COLOR,
    createdAt: iso,
    lastOpenedAt: iso,
    assigned: a.assigned,
    assignedUserIds: a.assignedUserIds,
    access: a.access,
    assignments: a.assignments,
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

/**
 * A `fetch` for gateway calls that keeps auth invisible across cloud restarts
 * (HOU-687): the bearer is read LIVE per attempt (never a pinned copy), and a
 * 401 triggers one single-flight session refresh and one replay with the fresh
 * token. A 401 that survives the refresh is returned as-is — a real sign-out
 * must surface, not spin. With no refresher installed (static tokens, tests)
 * the refresh resolves null and this degrades to a plain live-token fetch.
 */
export function gatewayAuthFetch(fallbackToken: string): typeof fetch {
  return async (input, init) => {
    const send = (bearer: string) => {
      const headers = new Headers(init?.headers);
      if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
      return fetch(input, { ...init, headers });
    };
    const res = await send(liveToken(fallbackToken));
    if (res.status !== 401) return res;
    const fresh = await refreshLiveToken();
    if (!fresh) return res;
    return send(fresh);
  };
}

/** Gateway statuses that mean "rolling deploy / pod handoff in progress", not a
 *  real answer: worth a brief blind retry for reads. */
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
/** Two retries, ~2s total — bridges a gateway roll's LB handoff, without
 *  masking a real outage for long. */
const TRANSIENT_RETRY_DELAYS_MS = [500, 1500];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cpFetch(
  cfg: ControlPlaneConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const doFetch = gatewayAuthFetch(cfg.token);
  const attempt = () =>
    doFetch(`${cfg.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

  // Reads retry through the deploy window; writes never blind-retry (a thrown
  // network error on a POST may have reached the gateway — the caller decides).
  const method = (init?.method ?? "GET").toUpperCase();
  const retriable = method === "GET" || method === "HEAD";
  let res: Response | undefined;
  let failure: unknown;
  for (let i = 0; ; i++) {
    failure = undefined;
    try {
      res = await attempt();
    } catch (err) {
      failure = err; // network-level: connection refused/reset mid-roll
    }
    const transient = res === undefined || TRANSIENT_STATUSES.has(res.status);
    if (!transient || !retriable || i >= TRANSIENT_RETRY_DELAYS_MS.length) {
      break;
    }
    await sleep(TRANSIENT_RETRY_DELAYS_MS[i]);
    res = undefined;
  }
  if (failure !== undefined || res === undefined) throw failure;
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
  seed?: {
    claudeMd?: string;
    seeds?: Record<string, string>;
  },
): Promise<Agent> {
  const res = await cpFetch(cfg, "/agents", {
    method: "POST",
    // The host seeds CLAUDE.md + the seed-file map on create (builtin
    // agent-manifest instructions/skills, AI-assist instructions).
    // JSON.stringify drops undefined fields, so a plain create still posts
    // just `{ name }`.
    body: JSON.stringify({
      name,
      claudeMd: seed?.claudeMd,
      seeds: seed?.seeds,
    }),
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
 * Push a desktop-extracted Anthropic OAuth credential to the agent's pod. The
 * body is the `claude` CLI's `.credentials.json` shape (`{claudeAiOauth:{...}}`),
 * already a JSON string; the host stores it centrally and materializes it on the
 * pod PVC. Used ONLY for a REMOTE engine — a hosted pod can't read this machine's
 * Keychain, so the co-located desktop (which shares the credential dir with its
 * local runtime) never calls this. Resolves on 200; throws the host's reason
 * otherwise so the caller can degrade to the paste flow.
 */
export async function pushClaudeOAuthCredential(
  cfg: ControlPlaneConfig,
  agentId: string,
  credentialJson: string,
): Promise<void> {
  await cpFetch(
    cfg,
    `/agents/${encodeURIComponent(agentId)}/credential/claude-oauth`,
    { method: "POST", body: credentialJson },
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
 * Mint a short-lived relay credential for the guided "connect a local model"
 * flow (`POST /v1/tunnel/credentials`, Supabase-authed via cpFetch, mirroring
 * `/v1/integrations`). The desktop runs its frpc sidecar against the returned
 * `relayHost:relayPort` so the user's local model server surfaces at `publicUrl`
 * for their cloud agent. Hosted-only — a non-gateway deployment 404s and cpFetch
 * throws the host's real error message (never swallowed).
 */
export async function getTunnelCredentials(
  cfg: ControlPlaneConfig,
): Promise<TunnelCredentials> {
  const res = await cpFetch(cfg, "/v1/tunnel/credentials", { method: "POST" });
  return (await res.json()) as TunnelCredentials;
}

/**
 * A runtime client scoped to ONE agent, via the control plane's transparent proxy.
 * Its `/conversations/:id/*` calls land on `${baseUrl}/agents/${agentId}/conversations/:id/*`.
 */
export function runtimeClientFor(
  cfg: ControlPlaneConfig,
  agentId: string,
): HoustonEngineClient {
  // Auth rides gatewayAuthFetch, never a pinned token: these clients back
  // long-lived turn streams, whose reconnects must present the CURRENT bearer
  // (and refresh it on 401) or a gateway roll kills the turn (HOU-687).
  return new HoustonEngineClient({
    baseUrl: `${cfg.baseUrl}/agents/${encodeURIComponent(agentId)}`,
    fetch: gatewayAuthFetch(cfg.token),
  });
}

/**
 * Runtime client for the host's hidden SETUP runtime (`/setup-runtime/*`):
 * the pre-agent provider-connect surface first-run onboarding uses. Provider
 * OAuth needs a runtime to execute in, but the flow connects the AI BEFORE the
 * first agent exists — the host runs it in a dedicated hidden runtime whose
 * captured credential lands on the personal workspace, so the agent created
 * right after is already connected.
 */
export function setupRuntimeClientFor(
  cfg: ControlPlaneConfig,
): HoustonEngineClient {
  return new HoustonEngineClient({
    baseUrl: `${cfg.baseUrl}/setup-runtime`,
    fetch: gatewayAuthFetch(cfg.token),
  });
}

/** Connect-once capture on the setup runtime — `captureCredential`, agentless. */
export async function captureSetupCredential(
  cfg: ControlPlaneConfig,
  provider?: string,
): Promise<void> {
  await cpFetch(cfg, `/setup-runtime/credential/capture`, {
    method: "POST",
    ...(provider ? { body: JSON.stringify({ provider }) } : {}),
  });
}

/** API-key connect on the setup runtime — `setApiKey`, agentless. */
export async function setSetupApiKey(
  cfg: ControlPlaneConfig,
  provider: string,
  apiKey: string,
): Promise<void> {
  await cpFetch(cfg, `/setup-runtime/credential/api-key`, {
    method: "POST",
    body: JSON.stringify({ provider, apiKey }),
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

/**
 * A single skill's full detail (its SKILL.md content) from the host's
 * `GET /agents/:id/skills/:slug`. Without this the adapter's Proxy fallback
 * stubbed skill detail to `[]`, so clicking any skill showed no content.
 */
export async function loadSkill(
  cfg: ControlPlaneConfig,
  agentId: string,
  slug: string,
): Promise<SkillDetail> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/skills/${encodeURIComponent(slug)}`,
  );
  return (await res.json()) as SkillDetail;
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

/** Stop an in-flight routine run — the host flips the row terminal, then aborts the turn. */
export async function cancelRoutineRun(
  cfg: ControlPlaneConfig,
  agentId: string,
  routineId: string,
  runId: string,
): Promise<RoutineRun> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/routines/${encodeURIComponent(routineId)}/runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" },
  );
  return (await res.json()) as RoutineRun;
}

// Agent-config library: user-scoped like the marketplace reads — a template
// belongs to the account, not to any existing agent.
export async function listInstalledConfigs(
  cfg: ControlPlaneConfig,
): Promise<InstalledConfig[]> {
  try {
    const res = await cpFetch(cfg, "/v1/agent-configs");
    return (await res.json()) as InstalledConfig[];
  } catch (err) {
    // The hosted gateway keeps no account-level config library (one pod per
    // agent, no shared disk) and answers 404 for the route — the same honest
    // answer as standalone web: nothing installed, the picker shows the
    // bundled templates (HOU-688). Every other failure still propagates.
    if (err instanceof HoustonEngineError && err.status === 404) return [];
    throw err;
  }
}
export async function installAgentFromGithub(
  cfg: ControlPlaneConfig,
  githubUrl: string,
): Promise<{ agentId: string }> {
  const res = await cpFetch(cfg, "/v1/agents/install-from-github", {
    method: "POST",
    body: JSON.stringify({ githubUrl }),
  });
  return (await res.json()) as { agentId: string };
}

// Marketplace reads ride the same agent scope as installs: the Add Skills
// dialog always browses FOR a specific agent, and the hosted gateway proxies
// nothing but /agents/:slug/* (a top-level /v1/skills/* has no pod to land on
// and 404s — the "Couldn't load suggestions" failure). The host serves these
// read routes agent-scoped too (skills-remote.ts), so one path shape works
// against both the local sidecar and the gateway.
export async function searchCommunitySkills(
  cfg: ControlPlaneConfig,
  agentId: string,
  query: string,
  signal?: AbortSignal,
): Promise<CommunitySkill[]> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/skills/community/search`,
    {
      method: "POST",
      body: JSON.stringify({ query }),
      signal,
    },
  );
  return (await res.json()) as CommunitySkill[];
}
export async function popularCommunitySkills(
  cfg: ControlPlaneConfig,
  agentId: string,
  signal?: AbortSignal,
): Promise<CommunitySkill[]> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/skills/community/popular`,
    { method: "POST", signal },
  );
  return (await res.json()) as CommunitySkill[];
}
export async function listSkillsFromRepo(
  cfg: ControlPlaneConfig,
  agentId: string,
  source: string,
  signal?: AbortSignal,
): Promise<RepoSkill[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/skills/repo/list`, {
    method: "POST",
    body: JSON.stringify({ source }),
    signal,
  });
  return (await res.json()) as RepoSkill[];
}
export async function installCommunitySkill(
  cfg: ControlPlaneConfig,
  agentId: string,
  body: { source: string; skillId: string },
  signal?: AbortSignal,
): Promise<string> {
  const res = await cpFetch(
    cfg,
    `${agentPath(agentId)}/skills/community/install`,
    { method: "POST", body: JSON.stringify(body), signal },
  );
  return (await res.json()) as string;
}
export async function installSkillsFromRepo(
  cfg: ControlPlaneConfig,
  agentId: string,
  body: { source: string; skills: RepoSkill[] },
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await cpFetch(cfg, `${agentPath(agentId)}/skills/repo/install`, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
  return (await res.json()) as string[];
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
 * dropped and the loop reconnects with a short backoff on any drop. A `401`
 * forces a session refresh (single-flight, HOU-687) so the next attempt's
 * re-read of `liveToken` carries a valid bearer — without it, an expired token
 * would 401-loop forever because nothing else re-mints while the app idles.
 */
export function subscribeEvents(
  cfg: ControlPlaneConfig,
  onEvent: (event: unknown) => void,
): () => void {
  const ac = new AbortController();
  void streamGlobalEvents({
    url: () =>
      `${cfg.baseUrl}/v1/events?token=${encodeURIComponent(liveToken(cfg.token))}`,
    // Wrapped, never the bare reference: streamGlobalEvents calls
    // `opts.fetch(...)`, and a browser's window.fetch invoked with a foreign
    // receiver throws "Illegal invocation" BEFORE any request goes out — the
    // stream then silently retry-looped forever and no server event ever
    // reached the app (agent-written routines/skills/files never refreshed).
    // Node's fetch is receiver-agnostic, so unit tests never caught it.
    fetch: (input, init) => fetch(input, init),
    signal: ac.signal,
    onUnauthorized: () => {
      void refreshLiveToken();
    },
    // Log-only (no toast): a background stream that auto-reconnects — but it
    // must never fail silently again.
    onError: (err) => console.warn("[events] global stream error:", err),
    onEvent: (data) =>
      onEvent(
        toInvalidationEvent(
          data as { type: string; agentPath?: string; workspaceId?: string },
        ),
      ),
  });
  return () => ac.abort();
}

/**
 * Translate a host global-events frame (`{ type, agentPath, workspaceId }`) into
 * the shape the app's invalidation map reads
 * (`{ type, data: { agent_path, workspace_id } }`, see
 * `app/src/hooks/use-agent-invalidation.ts`).
 *
 * Exported as the ONE source of that shape so the adapter's write-through echo
 * (`bus.emitLocalEcho`) can be verified to produce byte-identical events — a
 * locally synthesized echo and a real server frame must be indistinguishable to
 * the invalidation hook, or one of them silently no-ops.
 */
export function toInvalidationEvent(frame: {
  type: string;
  agentPath?: string;
  workspaceId?: string;
}): { type: string; data: { agent_path?: string; workspace_id?: string } } {
  return {
    type: frame.type,
    data: { agent_path: frame.agentPath, workspace_id: frame.workspaceId },
  };
}

// ── integrations (Composio, platform mode) ───────────────────────────────────
// User-level: no provider account — users only OAuth apps; the platform key
// lives with the host (or its cloud gateway). Types live once in the shared
// engine-client types (re-exported here so callers importing from the adapter
// keep one import site, and the v1 client agrees).

export type {
  AddOrgMemberResult,
  AgentAccess,
  AgentAssignment,
  AgentModelChoice,
  AgentModelChoiceInfo,
  AgentSettings,
  AuditEntry,
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
  OrgInfo,
  OrgInvite,
  OrgMember,
  OrgRole,
  OrgSettings,
  UsageRow,
} from "../../../../ui/engine-client/src/types";

import type {
  AddOrgMemberResult,
  AgentAccess,
  AgentAssignment,
  AgentModelChoice,
  AgentModelChoiceInfo,
  AgentSettings,
  AuditEntry,
  IntegrationConnection,
  IntegrationProviderStatus,
  IntegrationToolkit,
  OrgInfo,
  OrgRole,
  OrgSettings,
  UsageRow,
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
  agent?: string,
): Promise<{ redirectUrl: string; connectionId: string }> {
  const res = await cpFetch(cfg, `${integrationPath(provider)}/connect`, {
    method: "POST",
    body: JSON.stringify({ toolkit, ...(agent ? { agent } : {}) }),
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
): Promise<AddOrgMemberResult> {
  const res = await cpFetch(cfg, "/v1/org/members", {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  return (await res.json()) as AddOrgMemberResult;
}

export async function deleteOrgInvite(
  cfg: ControlPlaneConfig,
  inviteId: string,
): Promise<void> {
  await cpFetch(cfg, `/v1/org/invites/${encodeURIComponent(inviteId)}`, {
    method: "DELETE",
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
  assignments: AgentAssignment[] | string[],
): Promise<void> {
  const isV2 = assignments.length > 0 && typeof assignments[0] !== "string";
  const body = isV2
    ? { assignments: assignments as AgentAssignment[] }
    : { userIds: assignments as string[] };
  await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/assignments`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export async function getAgentSettings(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
): Promise<AgentSettings> {
  const res = await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/settings`,
  );
  return (await res.json()) as AgentSettings;
}

export async function setAgentSettings(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
  settings: {
    allowedToolkits?: string[] | null;
    allowedModels?: string[] | null;
  },
): Promise<void> {
  await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/settings`,
    { method: "PUT", body: JSON.stringify(settings) },
  );
}

/**
 * The ACTING user's model choice for this agent plus its effective
 * `allowedModels` ceiling, or `null` when the gateway does not serve model
 * choices (404) — a non-Teams host — so the composer degrades to single-player
 * behavior. Every other error still throws.
 */
export async function getAgentModelChoice(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
): Promise<AgentModelChoiceInfo | null> {
  try {
    const res = await cpFetch(
      cfg,
      `/v1/agents/${encodeURIComponent(agentSlugOrId)}/model-choice`,
    );
    return (await res.json()) as AgentModelChoiceInfo;
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) return null;
    throw err;
  }
}

/** Set the ACTING user's model choice for this agent (gateway clamps to ceiling). */
export async function setAgentModelChoice(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
  choice: AgentModelChoice,
): Promise<void> {
  await cpFetch(
    cfg,
    `/v1/agents/${encodeURIComponent(agentSlugOrId)}/model-choice`,
    { method: "PUT", body: JSON.stringify(choice) },
  );
}

export async function getOrgSettings(
  cfg: ControlPlaneConfig,
): Promise<OrgSettings> {
  const res = await cpFetch(cfg, "/v1/org/settings");
  return (await res.json()) as OrgSettings;
}

export async function setOrgSettings(
  cfg: ControlPlaneConfig,
  settings: { allowedToolkits: string[] | null },
): Promise<void> {
  await cpFetch(cfg, "/v1/org/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function orgAudit(
  cfg: ControlPlaneConfig,
  opts: { before?: number; limit?: number } = {},
): Promise<AuditEntry[]> {
  const q = new URLSearchParams();
  if (opts.before !== undefined) q.set("before", opts.before.toString());
  if (opts.limit !== undefined) q.set("limit", opts.limit.toString());
  const suffix = q.toString();
  const res = await cpFetch(cfg, `/v1/org/audit${suffix ? `?${suffix}` : ""}`);
  return ((await res.json()) as { entries: AuditEntry[] }).entries;
}

export async function orgUsage(
  cfg: ControlPlaneConfig,
  days: number,
): Promise<UsageRow[]> {
  const res = await cpFetch(
    cfg,
    `/v1/org/usage?days=${encodeURIComponent(days.toString())}`,
  );
  return ((await res.json()) as { rows: UsageRow[] }).rows;
}

/**
 * The integration toolkit slugs granted to this agent, or `null` when the host
 * does not serve grants (404) — a deployment without per-agent grants (e.g. a
 * managed cloud pod whose gateway owns the policy). Callers treat `null` as
 * "grants unsupported here" and degrade silently; every other error still throws.
 */
export async function agentIntegrationGrants(
  cfg: ControlPlaneConfig,
  agentSlugOrId: string,
): Promise<string[] | null> {
  try {
    const res = await cpFetch(
      cfg,
      `/v1/agents/${encodeURIComponent(agentSlugOrId)}/integration-grants`,
    );
    return ((await res.json()) as { toolkits: string[] }).toolkits;
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) return null;
    throw err;
  }
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
