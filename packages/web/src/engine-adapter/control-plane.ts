import { HoustonEngineClient } from "@houston/runtime-client";
import type { Agent } from "../../../../ui/engine-client/src/types";
import { DEFAULT_AGENT_COLOR, DEFAULT_AGENT_CONFIG_ID } from "./synthetic";
import { HoustonEngineError } from "./client";

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
}

// Color is a client-side cosmetic the control plane intentionally does not store
// (its model is id/name only). Keep a tiny local overlay so the UI's per-agent
// color survives reloads without bloating the server model.
const COLOR_KEY = "houston.web.cp.agentColors";
function colorOverlay(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(COLOR_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function setColor(agentId: string, color: string): void {
  try {
    localStorage.setItem(COLOR_KEY, JSON.stringify({ ...colorOverlay(), [agentId]: color }));
  } catch {
    /* storage disabled — color just falls back to the default */
  }
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
  };
}

async function cpFetch(cfg: ControlPlaneConfig, path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
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

export async function createAgent(cfg: ControlPlaneConfig, name: string, color?: string): Promise<Agent> {
  const res = await cpFetch(cfg, "/agents", { method: "POST", body: JSON.stringify({ name }) });
  const agent = (await res.json()) as CpAgent;
  if (color) setColor(agent.id, color);
  return toUiAgent(agent);
}

export async function renameAgent(cfg: ControlPlaneConfig, agentId: string, name: string): Promise<Agent> {
  const res = await cpFetch(cfg, `/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  return toUiAgent((await res.json()) as CpAgent);
}

/** Color is overlay-only; the server agent is unchanged. Returns the updated view. */
export async function updateAgentColor(cfg: ControlPlaneConfig, agentId: string, color: string): Promise<Agent> {
  setColor(agentId, color);
  const res = await cpFetch(cfg, "/agents");
  const found = ((await res.json()) as CpAgent[]).find((a) => a.id === agentId);
  if (!found) throw new HoustonEngineError(404, { error: { message: "agent not found" } });
  return toUiAgent(found);
}

export async function deleteAgent(cfg: ControlPlaneConfig, agentId: string): Promise<void> {
  await cpFetch(cfg, `/agents/${encodeURIComponent(agentId)}`, { method: "DELETE" });
}

/**
 * Connect-once: after a device-code connect lands on one agent, capture its
 * credential into the workspace's central store so every agent (existing + new)
 * shares the connection. Idempotent; safe to call on each successful connect.
 */
export async function captureCredential(cfg: ControlPlaneConfig, agentId: string): Promise<void> {
  await cpFetch(cfg, `/agents/${encodeURIComponent(agentId)}/credential/capture`, { method: "POST" });
}

/**
 * A runtime client scoped to ONE agent, via the control plane's transparent proxy.
 * Its `/conversations/:id/*` calls land on `${baseUrl}/agents/${agentId}/conversations/:id/*`.
 */
export function runtimeClientFor(cfg: ControlPlaneConfig, agentId: string): HoustonEngineClient {
  return new HoustonEngineClient({
    baseUrl: `${cfg.baseUrl}/agents/${encodeURIComponent(agentId)}`,
    token: cfg.token || undefined,
  });
}
