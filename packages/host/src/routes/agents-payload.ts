import { getPreference, hostTimezone, resolveTimezone } from "@houston/domain";
import { readAgentRole } from "../agent-role/read-role";
import type { Agent, Workspace } from "../domain/types";
import { type AgentRouteDeps, DEFAULT_PATHS } from "./agent-authz";
import { legacyAgentColor } from "./agent-legacy-color";

export async function agentPayload(
  deps: AgentRouteDeps,
  ws: Workspace,
  agent: Agent,
) {
  const timezone =
    deps.gatewayFronted || !deps.vfs
      ? hostTimezone()
      : resolveTimezone(await getPreference(deps.vfs, ws.id, "timezone"));
  const record = { ...agent, timezone };
  const base = deps.agentDir
    ? { ...record, dir: deps.agentDir(ws, agent) }
    : record;
  if (!deps.vfs) return base;
  const root = (deps.paths ?? DEFAULT_PATHS).agentRoot(ws, agent);
  const [color, role] = await Promise.all([
    legacyAgentColor(deps.vfs, root),
    readAgentRole(deps.vfs, root),
  ]);
  return {
    ...base,
    ...(color ? { color } : {}),
    ...(role ? { role } : {}),
  };
}
