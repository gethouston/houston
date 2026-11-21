export function isAgentGoneError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { status?: unknown }).status === 404;
}

export function isAgentUnreadableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { status?: unknown }).status === 403;
}

export function isStaleRosterReadError(err: unknown): boolean {
  return isAgentGoneError(err) || isAgentUnreadableError(err);
}

export interface AgentRosterSignals {
  loaded: boolean;
  loading: boolean;
}

export function agentRosterSettled(roster: AgentRosterSignals): boolean {
  return roster.loaded && !roster.loading;
}

export function makeRosterHealer(
  load: (workspaceId: string) => Promise<void>,
): (workspaceId: string | null, agentGone: boolean) => Promise<boolean> {
  let inFlight = false;
  return async (workspaceId, agentGone) => {
    if (!agentGone || workspaceId === null || inFlight) return false;
    inFlight = true;
    try {
      await load(workspaceId);
    } finally {
      inFlight = false;
    }
    return true;
  };
}

export function makeAgentGoneHealTrigger(
  heal: (workspaceId: string | null, agentGone: boolean) => Promise<boolean>,
  currentWorkspaceId: () => string | null,
): (err: unknown) => void {
  return (err) => {
    if (!isStaleRosterReadError(err)) return;
    void heal(currentWorkspaceId(), true);
  };
}

export function partitionStaleRosterReads<T extends { reason: unknown }>(
  failed: readonly T[],
): { stale: T[]; failed: T[] } {
  const stale: T[] = [];
  const rest: T[] = [];
  for (const read of failed)
    (isStaleRosterReadError(read.reason) ? stale : rest).push(read);
  return { stale, failed: rest };
}
