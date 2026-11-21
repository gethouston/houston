import type { Workspace } from "./types";

export type WorkspaceGateState = "loading" | "failed" | "empty" | "ready";

export interface WorkspaceGateInputs {
  current: Workspace | null;
  loading: boolean;
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
