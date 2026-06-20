/**
 * Idempotent get-or-create for the first-run default workspace and its
 * assistant — the fix for HOU-444.
 *
 * The onboarding orchestrator can invoke workspace creation more than once
 * for a single install: a double-clicked "Continue", the welcome-screen
 * "Skip" racing a mission, a retry after a step failed partway, or an
 * orchestrator remount when `tutorialActive` toggles. Calling the engine's
 * `createWorkspace` blindly each time made the second call hit the dup-name
 * guard and reject with `conflict: workspace named "Personal" already
 * exists`, which then surfaced as an unhandled rejection (Sentry
 * HOUSTON-APP-7D).
 *
 * Reusing the existing workspace — and any assistant already inside it (the
 * engine rejects a duplicate AGENT name too) — makes the whole step safe to
 * run repeatedly. Pure + dependency-injected so it unit-tests without the
 * React / store / tauri graph.
 */

export interface WorkspaceLike {
  id: string;
  name: string;
}

export interface EnsureWorkspaceDeps<W extends WorkspaceLike, A> {
  /** All existing workspaces (engine `list_workspaces`). */
  listWorkspaces: () => Promise<W[]>;
  /** Create a brand-new workspace with this name. */
  createWorkspace: (name: string) => Promise<W>;
  /** Agents already inside the workspace (engine `list_agents`). */
  listAgents: (workspaceId: string) => Promise<A[]>;
  /** Create the default assistant inside the workspace. */
  createAssistant: (workspaceId: string) => Promise<A>;
}

export interface EnsuredWorkspace<W, A> {
  workspace: W;
  assistant: A;
  /**
   * True only when this call actually created the workspace (vs. reused an
   * existing one). Lets the caller fire `workspace_created` analytics exactly
   * once per install rather than on every retry.
   */
  createdWorkspace: boolean;
}

/**
 * Get-or-create the named workspace and ensure it has an assistant. Safe to
 * call repeatedly: an existing workspace (and its first assistant) is reused
 * instead of re-created, so a retried / double-fired first-run never hits the
 * engine's dup-name conflict.
 */
export async function ensureWorkspaceWithAssistant<W extends WorkspaceLike, A>(
  workspaceName: string,
  deps: EnsureWorkspaceDeps<W, A>,
): Promise<EnsuredWorkspace<W, A>> {
  const name = workspaceName.trim();
  const existing = (await deps.listWorkspaces()).find((w) => w.name === name);
  const workspace = existing ?? (await deps.createWorkspace(name));
  const createdWorkspace = existing === undefined;

  // A freshly created workspace has no agents; only an already-existing one
  // could carry an assistant from a prior partial run. Reuse it rather than
  // creating a second (which the engine would reject as a duplicate name).
  const existingAssistant = createdWorkspace
    ? undefined
    : (await deps.listAgents(workspace.id))[0];
  const assistant =
    existingAssistant ?? (await deps.createAssistant(workspace.id));

  return { workspace, assistant, createdWorkspace };
}
