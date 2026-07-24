import type { Workspace } from "./types";

/**
 * Resolve which workspace to activate when the switcher loads.
 *
 * Restores the last-selected workspace (persisted by `setCurrent` under the
 * `last_workspace_id` preference) when it is still present in the list, else
 * falls back to the default workspace, else the first, else `null`. Pure so the
 * resolution is unit-tested without the store's engine/preference side effects.
 *
 * The fallback chain keeps a personal-only host byte-identical: with a single
 * default workspace it resolves to that workspace whether or not a stale id was
 * persisted.
 */
export function resolveActiveWorkspace(
  workspaces: Workspace[],
  lastId: string | null,
): Workspace | null {
  const restored = lastId ? workspaces.find((w) => w.id === lastId) : undefined;
  return (
    restored ?? workspaces.find((w) => w.isDefault) ?? workspaces[0] ?? null
  );
}

/**
 * What a workspace-gated screen should render before its content.
 *
 * "No current workspace" hides three genuinely different situations, and
 * treating them as one is what made a failed load spin forever (HOU-818): the
 * store gives up, clears `loading`, and nothing ever fills `current`.
 *
 *  - `loading` — a load is in flight and nothing has resolved yet: spinner.
 *  - `failed`  — the last load threw: the connection is the likely culprit,
 *                so say so and offer a retry.
 *  - `empty`   — the load SUCCEEDED and returned no workspace. Nothing is
 *                broken, so the copy must not blame the connection; it is
 *                still a dead end, so it keeps the retry.
 *  - `ready`   — a workspace is current. Wins over an in-flight refresh: a
 *                retry or a later reload must never blank live content.
 */
export type WorkspaceGateState = "loading" | "failed" | "empty" | "ready";

export interface WorkspaceGateInputs {
  current: Workspace | null;
  /** A load is in flight (`useWorkspaceStore.loading`). */
  loading: boolean;
  /** The last settled load threw (`useWorkspaceStore.loadError`). */
  loadError: boolean;
}

export function workspaceGateState({
  current,
  loading,
  loadError,
}: WorkspaceGateInputs): WorkspaceGateState {
  if (current) return "ready";
  if (loading) return "loading";
  return loadError ? "failed" : "empty";
}
