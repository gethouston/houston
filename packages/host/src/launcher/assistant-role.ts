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
 *    The stamp counts ONLY on a gateway-fronted host ({@link MANAGED_CLOUD_ENV}),
 *    the same second factor `routes/assistant-claim.ts` requires: a self-hoster
 *    who copied the documented assistant variables into an ordinary host would
 *    otherwise turn EVERY agent there into a coordinator, stripped of bash and
 *    skills and refused a `start_mission`.
 *
 * The runtime is told ONLY its role. No gateway URL and no gateway token ever
 * crosses into a runtime process: the credential that drives Houston operations
 * stays with the host's dispatcher, which the runtime reaches through
 * `/sandbox/assistant/call` with its own per-agent sandbox token.
 */

export {
  ASSISTANT_ROLE_ENV,
  ASSISTANT_USER_ID_ENV,
  type AssistantRuntimeRole,
  assistantRoleEnv,
  COORDINATOR_ROLE,
  readAssistantRole,
} from "@houston/domain/assistant-role";

import {
  ASSISTANT_USER_ID_ENV,
  type AssistantRuntimeRole,
  COORDINATOR_ROLE,
} from "@houston/domain/assistant-role";

/**
 * The managed-cloud profile marker. The host reads it as `gatewayFronted`
 * everywhere else (`local/main.ts`); this module reads the raw variable because
 * the role decision is taken while spawning, from the host's own environment,
 * with no request and no deps bag in reach.
 */
export const MANAGED_CLOUD_ENV = "HOUSTON_MANAGED_CLOUD";

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
  if (
    hostEnv[MANAGED_CLOUD_ENV] === "1" &&
    hostEnv[ASSISTANT_USER_ID_ENV]?.trim()
  )
    return COORDINATOR_ROLE;
  return agentName(input.agentId) === ASSISTANT_AGENT_NAME
    ? COORDINATOR_ROLE
    : null;
}
