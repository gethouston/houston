import type { Workspace } from "./types";

/**
 * What a background space-list refresh should do with a freshly-listed set
 * (the live-spaces poll, `useSpacesLiveRefresh`). Pure so the merge decision is
 * unit-tested without the store's engine/preference side effects — the store
 * applies the plan.
 *
 *  - `unchanged` — same spaces, same names: touch nothing (the common tick).
 *  - `update`    — the list changed but the active space survives: swap the
 *                  list in place, adopting the fresh current object so a
 *                  server-side rename of the active space shows too. No
 *                  re-pin, no cache reset — the active org is the same.
 *  - `reselect`  — the ACTIVE space vanished (the user was removed from that
 *                  team while the app was open): land on the default/first
 *                  space; the store must then re-pin the active org and reset
 *                  the space-scoped caches exactly like a user-driven switch —
 *                  staying pinned to a space the gateway now 403s would strand
 *                  every request.
 */
export type SpacesRefreshPlan =
  | { kind: "unchanged" }
  | { kind: "update"; workspaces: Workspace[]; current: Workspace | null }
  | { kind: "reselect"; workspaces: Workspace[]; current: Workspace | null };

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
        current: fresh.find((w) => w.isDefault) ?? fresh[0] ?? null,
      };
    }
    return { kind: "update", workspaces: fresh, current: stillCurrent };
  }
  return { kind: "update", workspaces: fresh, current: null };
}
