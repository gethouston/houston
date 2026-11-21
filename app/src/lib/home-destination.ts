export type HomeDestination =
  | { kind: "agents-home" }
  | { kind: "agent"; agentId: string };

export function homeDestination(input: {
  isMobile: boolean;
  rosterReady: boolean;
  firstAgentId: string | null;
}): HomeDestination {
  if (input.isMobile || !input.rosterReady || input.firstAgentId === null)
    return { kind: "agents-home" };
  return { kind: "agent", agentId: input.firstAgentId };
}
