import { readAgentRole } from "../agent-role/read-role";
import type { Agent, Workspace } from "../domain/types";
import { type AgentRouteDeps, DEFAULT_PATHS } from "./agent-authz";
import { legacyAgentColor } from "./agent-legacy-color";

/**
 * The agent as the wire serves it: the record plus the deployment extras — the
 * real directory (`dir`, local profile only), the Rust-era legacy `color`
 * (read from `.houston/agent.json`; the client overlay outranks it, see
 * agent-legacy-color.ts), and the `role` its job description names. Color and
 * role are attached only where a vfs is wired.
 */
export async function agentPayload(
  deps: AgentRouteDeps,
  ws: Workspace,
  agent: Agent,
) {
  const base = deps.agentDir
    ? { ...agent, dir: deps.agentDir(ws, agent) }
    : agent;
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
