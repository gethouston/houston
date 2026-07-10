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
