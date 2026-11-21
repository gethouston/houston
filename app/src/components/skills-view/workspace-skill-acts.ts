export interface WorkspaceActsRow {
  origin?: "shared" | "local";
  agents: readonly { id: string }[];
}

export function offersShareToWorkspace(
  row: WorkspaceActsRow,
  sharedStore: boolean,
): boolean {
  return sharedStore && row.origin === "local";
}

export function offersEnableForAll(
  row: WorkspaceActsRow,
  workspaceAgentCount: number,
  sharedStore: boolean,
): boolean {
  return (
    sharedStore &&
    row.origin === "shared" &&
    row.agents.length < workspaceAgentCount
  );
}

export function offersDeleteForEveryone(
  row: WorkspaceActsRow,
  sharedStore: boolean,
): boolean {
  if (sharedStore && row.origin === "shared") return true;
  return row.agents.length > 1;
}

export type WorkspaceActsState = "checking" | "failed" | "ready" | "none";

export function workspaceActsState(input: {
  loading: boolean;
  failed: boolean;
  complete: boolean;
  found: boolean;
}): WorkspaceActsState {
  if (input.failed) return "failed";
  if (input.loading) return "checking";
  if (!input.complete) return "failed";
  return input.found ? "ready" : "none";
}

export function everyReadAnswered(
  results: readonly { isSuccess: boolean }[],
): boolean {
  return results.every((r) => r.isSuccess);
}

export function withCanonicalHolder<T extends WorkspaceActsRow>(
  row: T,
  agentId: string,
): T {
  const mine = row.agents.filter((a) => a.id === agentId);
  if (mine.length === 0) return row;
  return {
    ...row,
    agents: [...mine, ...row.agents.filter((a) => a.id !== agentId)],
  };
}
