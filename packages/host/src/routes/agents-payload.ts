import type { Agent, Workspace } from "../domain/types";
import { type AgentRouteDeps, DEFAULT_PATHS } from "./agent-authz";
import { legacyAgentColor } from "./agent-legacy-color";

/**
 * The agent as the wire serves it: the record plus the deployment extras — the
 * real directory (`dir`, local profile only) and the Rust-era legacy `color`
 * (read from `.houston/agent.json`; the client overlay outranks it, see
 * agent-legacy-color.ts). Color is attached only where a vfs is wired.
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
  const paths = deps.paths ?? DEFAULT_PATHS;
  const color = await legacyAgentColor(deps.vfs, paths.agentRoot(ws, agent));
  return color ? { ...base, color } : base;
}
