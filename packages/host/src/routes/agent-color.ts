import type { IncomingMessage, ServerResponse } from "node:http";
import { updatePreference } from "@houston/domain";
import type { UserId } from "../domain/types";
import type { Vfs } from "../vfs";
import { type AgentRouteDeps, authorizeAgent } from "./agent-authz";
import { json, readJson } from "./http";

/**
 * One agent's color, written host-side. The durable home is the `agent_colors`
 * ACCOUNT preference — a single JSON blob of agent id → color that the app's
 * color sync owns and reads back through `/v1/preferences/agent_colors`, so
 * this route reads-modifies-writes that SAME doc rather than opening a second
 * store the app would never see. (The Rust-era per-agent `.houston/agent.json`
 * color is a read-only legacy fallback; see agent-legacy-color.ts.)
 *
 * It exists because the personal assistant changes a color by dispatching ONE
 * HTTP request: it cannot read the whole map, merge an entry and put it back.
 */
export const AGENT_COLORS_PREF_KEY = "agent_colors";

/** Longest color value accepted — a palette id or a hex, never a payload. */
const MAX_COLOR_LENGTH = 64;

/**
 * Parse the stored preference defensively: absent/corrupt/non-object reads as
 * empty, and only string→string entries survive. Mirrors the app's
 * `parseAccountColors` — the two sides parse the same bytes, so they must agree
 * on which entries are real.
 */
export function parseAgentColorMap(raw: string | null): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return {};
  const out: Record<string, string> = {};
  for (const [id, color] of Object.entries(parsed)) {
    if (
      typeof color === "string" &&
      color.length > 0 &&
      color.length <= MAX_COLOR_LENGTH
    )
      out[id] = color;
  }
  return out;
}

/**
 * The color to store, or null when the input is not one. SHAPE only: the
 * palette-id enum is enforced upstream by the assistant catalog's parameter
 * schema, and the app has stored raw hexes since before palettes existed — a
 * host-side allowlist would reject colors users already have.
 */
export function agentColorOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_COLOR_LENGTH) return null;
  return trimmed;
}

/**
 * Read-modify-write the map; the mutation returns the next one.
 *
 * `updatePreference` serializes the load, the edit and the save per preference
 * DOCUMENT. Without that, two overlapping writers read the same base and the
 * last save drops the other's entry — and colors are written in bursts (a
 * template installs several agents at once, a rename recolors while a create
 * writes), so the loser vanishes silently, leaving an agent wearing the
 * default. Different accounts key different documents and never wait on each
 * other.
 */
async function editColorMap(
  vfs: Vfs,
  workspaceId: string,
  edit: (current: Record<string, string>) => Record<string, string>,
): Promise<Record<string, string>> {
  const { preferences } = await updatePreference(
    vfs,
    workspaceId,
    AGENT_COLORS_PREF_KEY,
    (current) => JSON.stringify(edit(parseAgentColorMap(current))),
  );
  return parseAgentColorMap(preferences[AGENT_COLORS_PREF_KEY] ?? null);
}

/** Merge one agent's color into the `agent_colors` map; returns the merge. */
export function storeAgentColor(
  vfs: Vfs,
  workspaceId: string,
  agentId: string,
  color: string,
): Promise<Record<string, string>> {
  return editColorMap(vfs, workspaceId, (current) => ({
    ...current,
    [agentId]: color,
  }));
}

/**
 * Carry an agent's color to its new id. A local agent's id IS its workspace
 * path, so a rename changes it — without this the renamed agent falls back to
 * the default color, which is the same reason the app moves its own overlay
 * entry. No-op when the id did not change or the agent had no color.
 */
export function moveAgentColor(
  vfs: Vfs,
  workspaceId: string,
  fromId: string,
  toId: string,
): Promise<Record<string, string>> {
  return editColorMap(vfs, workspaceId, (current) => {
    const color = current[fromId];
    if (fromId === toId || color === undefined) return current;
    const { [fromId]: _moved, ...rest } = current;
    return { ...rest, [toId]: color };
  });
}

/**
 * Drop a deleted agent's entry, so a future agent that reuses the same
 * path-derived id cannot inherit a dead color.
 */
export function clearAgentColor(
  vfs: Vfs,
  workspaceId: string,
  agentId: string,
): Promise<Record<string, string>> {
  return editColorMap(vfs, workspaceId, ({ [agentId]: _dropped, ...rest }) => ({
    ...rest,
  }));
}

const COLOR_ROUTE = /^\/v1\/agents\/([^/]+)\/color$/;

/**
 * `PUT /v1/agents/:agentId/color` — set one agent's color in a single request.
 * Returns true when the request was handled.
 */
export async function handleAgentColor(
  deps: AgentRouteDeps,
  userId: UserId,
  method: string,
  path: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const match = COLOR_ROUTE.exec(path);
  if (!match) return false;
  if (method !== "PUT") {
    json(res, 405, { error: "method not allowed" });
    return true;
  }
  const raw = match[1];
  if (raw === undefined) return false;
  const agentId = decodeURIComponent(raw);

  const authz = await authorizeAgent(deps, userId, agentId);
  if (!authz.ok) {
    json(res, authz.status, { error: authz.reason });
    return true;
  }
  if (!deps.vfs) {
    json(res, 503, { error: "preferences not configured" });
    return true;
  }
  const color = agentColorOrNull((await readJson(req)).color);
  if (!color) {
    json(res, 400, { error: "invalid 'color'" });
    return true;
  }

  // Keyed by the caller's PERSONAL workspace, which is exactly how
  // `/v1/preferences/:key` resolves the doc — anything else would write a map
  // the app never reads.
  const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
  await storeAgentColor(deps.vfs, ws.id, agentId, color);
  deps.events?.emit(authz.workspace.ownerUserId, {
    type: "AgentsChanged",
    workspaceId: authz.workspace.id,
  });
  json(res, 200, { agentId, color });
  return true;
}
