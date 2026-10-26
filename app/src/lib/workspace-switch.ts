import type { Workspace } from "./types";

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
