export const AGENT_SETUP_AGENT_MODE = "houston:agent-setup";

export function isAgentSetupMode(agent: string | null | undefined): boolean {
  return agent === AGENT_SETUP_AGENT_MODE;
}
