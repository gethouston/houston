/**
 * The whole-workspace acts an employee's skill editor offers, decided on the
 * skill's WORKSPACE row (every holder), never on the section's narrowed one:
 * sharing, enabling or deleting a skill for everyone has to reach everyone,
 * and the narrowed row names only this employee. Pure, so node-testable.
 */

/** The slice of a workspace row these rules read. */
export interface WorkspaceActsRow {
  /** Where the canonical copy lives; absent where there is no store. */
  origin?: "shared" | "local";
  /** Every employee the skill is live on. */
  agents: readonly { id: string }[];
}

/**
 * "Share with all AI Employees": move per-employee copies into the store.
 * Promoting fans out over every holder the row names, so it reads the
 * workspace row; there is no store to promote into without one.
 */
export function offersShareToWorkspace(
  row: WorkspaceActsRow,
  sharedStore: boolean,
): boolean {
  return sharedStore && row.origin === "local";
}

/** "Enable for all AI Employees": a store skill some employees do not load. */
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

/**
 * "Delete for everyone": a store skill, or copies on more than one employee.
 * A copy this employee alone holds is the section's own Delete, which says
 * the same thing, so the menu does not offer it twice.
 */
export function offersDeleteForEveryone(
  row: WorkspaceActsRow,
  sharedStore: boolean,
): boolean {
  if (sharedStore && row.origin === "shared") return true;
  return row.agents.length > 1;
}

/** Where the menu's workspace-wide acts stand while it reads every employee. */
export type WorkspaceActsState = "checking" | "failed" | "ready" | "none";

/**
 * The acts need EVERY holder: a row found while other employees' reads are
 * still out names only some of them, so "Delete for all" would miss the rest.
 * Nothing is offered until every read has landed; a read that failed, or
 * settled without an answer (an employee the server will not read), offers
 * nothing and says so.
 */
export function workspaceActsState(input: {
  loading: boolean;
  failed: boolean;
  /** Every employee's read answered with what it holds. */
  complete: boolean;
  /** The skill's workspace row is among what has landed. */
  found: boolean;
}): WorkspaceActsState {
  if (input.failed) return "failed";
  if (input.loading) return "checking";
  if (!input.complete) return "failed";
  return input.found ? "ready" : "none";
}

/**
 * Whether every read's LATEST attempt answered. Cached data is not enough: a
 * refetch the server refused (a gone or unreadable employee, silenced rather
 * than failed) keeps the old list in the cache, and that list no longer says
 * what the employee holds.
 */
export function everyReadAnswered(
  results: readonly { isSuccess: boolean }[],
): boolean {
  return results.every((r) => r.isSuccess);
}

/**
 * The row with this employee's copy first. Sharing takes the FIRST holder's
 * copy as the one the store keeps, and sharing from this employee's editor
 * means sharing the version this employee has.
 */
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

/** Only the store copy used by this employee alone may leave the workspace. */
export function offersKeepOnlyForAgent(
  row: WorkspaceActsRow,
  agentId: string,
  sharedStore: boolean,
): boolean {
  return (
    sharedStore &&
    row.origin === "shared" &&
    row.agents.every((agent) => agent.id === agentId)
  );
}
