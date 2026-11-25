import { updatePreference } from "@houston/domain";
import type { Vfs } from "../vfs";
import { authorizeAgent } from "./agent-authz";
import { json, readJson } from "./http";
import { defineRoute } from "./registry";

export const AGENT_COLORS_PREF_KEY = "agent_colors";

const MAX_COLOR_LENGTH = 64;

// WHY: Must match the app's parseAccountColors; both parse the same bytes. ADR-0016
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

// WHY: Shape check only; users still hold raw hex colors, and the catalog schema enforces the palette. ADR-0016
export function agentColorOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_COLOR_LENGTH) return null;
  return trimmed;
}

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

export function clearAgentColor(
  vfs: Vfs,
  workspaceId: string,
  agentId: string,
): Promise<Record<string, string>> {
  return editColorMap(vfs, workspaceId, ({ [agentId]: _dropped, ...rest }) => ({
    ...rest,
  }));
}

defineRoute({
  group: "agent-color",
  method: "PUT",
  path: "/v1/agents/:agentId/color",
  methodMismatch: "405",
  phase: "user",
  classification: "sdk",
  source: "packages/host/src/routes/agent-color.ts",
  async handler({ deps, userId, params, req, res }) {
    const agentId = params.agentId ?? "";
    const authz = await authorizeAgent(deps, userId, agentId);
    if (!authz.ok) return json(res, authz.status, { error: authz.reason });
    if (!deps.vfs)
      return json(res, 503, { error: "preferences not configured" });
    const color = agentColorOrNull((await readJson(req)).color);
    if (!color) return json(res, 400, { error: "invalid 'color'" });

    const ws = await deps.store.getOrCreatePersonalWorkspace(userId);
    await storeAgentColor(deps.vfs, ws.id, agentId, color);
    deps.events?.emit(authz.workspace.ownerUserId, {
      type: "AgentsChanged",
      workspaceId: authz.workspace.id,
    });
    json(res, 200, { agentId, color });
  },
});
