import type { Workspace } from "./types";

/** Accessible account choice, then device choice, then the first team, then personal. */
export function resolveActiveWorkspace<
  T extends Pick<Workspace, "id" | "isDefault" | "kind">,
>(
  workspaces: readonly T[],
  lastId: string | null | undefined,
  deviceId?: string | null,
): T | null {
  return (
    workspaces.find((w) => w.id === lastId) ??
    workspaces.find((w) => w.id === deviceId) ??
    workspaces.find((w) => w.kind === "org" || w.id.startsWith("org:")) ??
    workspaces.find((w) => w.isDefault) ??
    workspaces[0] ??
    null
  );
}
