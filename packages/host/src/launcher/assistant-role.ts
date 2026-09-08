import { ASSISTANT_AGENT_NAME } from "../routes/assistant";

/**
 * WHICH spawned runtime is the user's personal-assistant COORDINATOR, and the
 * one variable that tells it so.
 *
 * The coordinator is a different kind of process from every other runtime: it
 * operates Houston on the user's behalf (`houston_capabilities` /
 * `houston_describe` / `houston_call`), hands every piece of real work to one
 * of the user's agents, and in exchange gives up bash, the skills directory and
 * the rest of the working toolset. That difference must be decided by the HOST,
 * which knows which agent it is spawning, and never inferred inside the runtime
 * from its working directory: a managed pod provisions the assistant under
 * `/workspace` with an ordinarily-named agent, so a directory-name check reads
 * the coordinator as a plain agent there and hands it plain-agent policy.
 *
 * Two shapes, one decision:
 *  - DESKTOP / SELF-HOST: this host spawns every one of the user's agents, and
 *    the coordinator among them is the synthetic dot-named `.assistant`
 *    (routes/assistant.ts) — a name no user action can produce.
 *  - MANAGED ASSISTANT POD: the gateway stamps {@link ASSISTANT_USER_ID_ENV}
 *    into the pod, whose single runtime IS the coordinator. The host's own
 *    environment is trusted here; a runtime's is not, which is why the pod host
 *    re-states the decision to its child instead of the child reading this var.
 *
 * The runtime is told ONLY its role. No gateway URL and no gateway token ever
 * crosses into a runtime process: the credential that drives Houston operations
 * stays with the host's dispatcher, which the runtime reaches through
 * `/sandbox/assistant/call` with its own per-agent sandbox token.
 */

/** The one variable a spawned runtime reads to learn it is the coordinator. */
export const ASSISTANT_ROLE_ENV = "HOUSTON_ASSISTANT_ROLE";

/**
 * Stamped by the managed gateway into an assistant pod's environment. Read here
 * from the HOST's own env only, as the marker that this pod is a user's
 * assistant rather than an agent pod.
 */
export const ASSISTANT_USER_ID_ENV = "HOUSTON_ASSISTANT_USER_ID";

/**
 * A runtime's assistant role. One value today, a union rather than a boolean
 * because the role names WHAT the process is, and any future role (a reviewer,
 * a second coordinator tier) has to be spelled out at every gate rather than
 * silently inheriting "not the assistant".
 */
export type AssistantRuntimeRole = "coordinator";

export const COORDINATOR_ROLE: AssistantRuntimeRole = "coordinator";

export interface AssistantRoleInput {
  /** The agent this runtime is spawned for: `<workspaceId>/<agentName>`. */
  agentId: string;
  /** THIS host's own environment (never a runtime's). Defaults to `process.env`. */
  hostEnv?: NodeJS.ProcessEnv;
}

/** The name segment of an agent id (`ws/Writer` → `Writer`). */
function agentName(agentId: string): string {
  const cut = agentId.lastIndexOf("/");
  return cut === -1 ? agentId : agentId.slice(cut + 1);
}

/** The role of the runtime this host is about to spawn, or null for a plain agent. */
export function assistantRuntimeRole(
  input: AssistantRoleInput,
): AssistantRuntimeRole | null {
  const hostEnv = input.hostEnv ?? process.env;
  if (hostEnv[ASSISTANT_USER_ID_ENV]?.trim()) return COORDINATOR_ROLE;
  return agentName(input.agentId) === ASSISTANT_AGENT_NAME
    ? COORDINATOR_ROLE
    : null;
}

/** The environment a runtime carries for its role: one variable, or nothing. */
export function assistantRoleEnv(
  role: AssistantRuntimeRole | null,
): Record<string, string> {
  return role ? { [ASSISTANT_ROLE_ENV]: role } : {};
}

/**
 * The role a runtime was TOLD it has — the only signal a runtime process trusts
 * about which kind of agent it is running. Anything but the exact coordinator
 * value (including an empty or misspelled one) is a plain agent.
 */
export function readAssistantRole(
  env: NodeJS.ProcessEnv = process.env,
): AssistantRuntimeRole | null {
  return env[ASSISTANT_ROLE_ENV]?.trim() === COORDINATOR_ROLE
    ? COORDINATOR_ROLE
    : null;
}
