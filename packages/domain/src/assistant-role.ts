/**
 * WHICH runtime is the user's personal-assistant COORDINATOR, expressed as the
 * one variable a spawned process reads and the one value it may hold.
 *
 * The coordinator is a different kind of process from every other runtime: it
 * operates Houston on the user's behalf, hands every piece of real work to one
 * of the user's agents, and in exchange gives up bash, the skills directory and
 * the rest of the working toolset. That difference is decided by the HOST,
 * which knows which agent it is spawning, and is never inferred inside the
 * runtime from its working directory: a managed pod provisions the assistant
 * under `/workspace` with an ordinarily-named agent, so a directory-name check
 * would read the coordinator as a plain agent there and hand it plain-agent
 * policy.
 *
 * The names live in DOMAIN because both sides of the handshake need them and
 * neither owns the other: the host stamps the variable when it spawns, the
 * runtime reads it at boot. Deciding WHICH agent gets the role additionally
 * needs the host's synthetic assistant agent name, so that decision stays in
 * the host (`packages/host/src/launcher/assistant-role.ts`).
 */

/** The one variable a spawned runtime reads to learn it is the coordinator. */
export const ASSISTANT_ROLE_ENV = "HOUSTON_ASSISTANT_ROLE";

/**
 * Stamped by the managed gateway into an assistant pod's environment. Read from
 * the HOST's own env only, as the marker that this pod is a user's assistant
 * rather than an agent pod.
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
