/** Where home is: an employee's Tasks screen, or the AI Employees home. */
export type HomeDestination =
  | { kind: "agents-home" }
  | { kind: "agent"; agentId: string };

/**
 * Home is where the app opens. The desktop opens on the first employee in
 * sidebar order; the phone's home is its Agents tab root. The desktop stays on
 * the AI Employees home only while the roster or sidebar layout is still
 * resolving (the boot landing finishes the move once both settle) or when the
 * roster is empty.
 */
export function homeDestination(input: {
  isMobile: boolean;
  /** This workspace's roster and sidebar layout have both settled. */
  rosterReady: boolean;
  firstAgentId: string | null;
}): HomeDestination {
  if (input.isMobile || !input.rosterReady || input.firstAgentId === null)
    return { kind: "agents-home" };
  return { kind: "agent", agentId: input.firstAgentId };
}
