import { resolveActiveWorkspace } from "@houston/sdk";
import type { Workspace } from "./types";

export type SpacesRefreshPlan =
  | { kind: "unchanged" }
  | { kind: "update"; workspaces: Workspace[]; current: Workspace | null }
  | { kind: "reselect"; workspaces: Workspace[]; current: Workspace | null };

export function withoutPendingDeletes(
  fresh: Workspace[],
  pending: ReadonlySet<string>,
): Workspace[] {
  return pending.size === 0 ? fresh : fresh.filter((w) => !pending.has(w.id));
}

export function planSpacesRefresh(
  previous: Workspace[],
  current: Workspace | null,
  fresh: Workspace[],
): SpacesRefreshPlan {
  const sameList =
    fresh.length === previous.length &&
    fresh.every((w) => {
      const old = previous.find((o) => o.id === w.id);
      return old !== undefined && old.name === w.name;
    });
  if (sameList) return { kind: "unchanged" };

  if (current !== null) {
    const stillCurrent = fresh.find((w) => w.id === current.id);
    if (stillCurrent === undefined) {
      return {
        kind: "reselect",
        workspaces: fresh,
        current: resolveActiveWorkspace(fresh, null),
      };
    }
    return { kind: "update", workspaces: fresh, current: stillCurrent };
  }
  return { kind: "update", workspaces: fresh, current: null };
}
