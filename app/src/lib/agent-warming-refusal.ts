export const AGENT_WARMING_ERROR_NAME = "AgentWarmingError";

export function isAgentWarmingRefusal(err: unknown): boolean {
  return err instanceof Error && err.name === AGENT_WARMING_ERROR_NAME;
}
