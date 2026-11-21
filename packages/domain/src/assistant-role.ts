export const ASSISTANT_ROLE_ENV = "HOUSTON_ASSISTANT_ROLE";

export const ASSISTANT_USER_ID_ENV = "HOUSTON_ASSISTANT_USER_ID";

export type AssistantRuntimeRole = "coordinator";

export const COORDINATOR_ROLE: AssistantRuntimeRole = "coordinator";

export function assistantRoleEnv(
  role: AssistantRuntimeRole | null,
): Record<string, string> {
  return role ? { [ASSISTANT_ROLE_ENV]: role } : {};
}

export function readAssistantRole(
  env: NodeJS.ProcessEnv = process.env,
): AssistantRuntimeRole | null {
  return env[ASSISTANT_ROLE_ENV]?.trim() === COORDINATOR_ROLE
    ? COORDINATOR_ROLE
    : null;
}
