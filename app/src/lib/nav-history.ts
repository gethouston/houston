/**
 * The nav stack's browser-history mirror — the ONLY code in the app allowed to
 * touch `history` (pushState/popstate). Screens never call pushState; they
 * navigate through the ui store, this layer echoes the stack into the browser,
 * and the browser's back/forward come back in through `popstate`.
 *
 * The URL never changes (there is no router): every history entry shares the
 * page's URL and carries only a stack index in its state. That is what keeps
 * this layer compatible with the one pre-existing history call —
 * `store-deeplink-ingress.ts` strips `?install=`/`?creator=` with a
 * `replaceState` that passes `window.history.state` through, so the index
 * survives in either order.
 *
 * Refresh: the in-memory stack re-boots to a single entry while the browser
 * keeps the old session's entries below the current one. Their indices no
 * longer mean anything, so `navApplyHistory` clamps them onto the fresh stack
 * (they all decay to the root) and the next in-app push truncates them —
 * graceful, never a crash. Forward is the same mechanism in the other
 * direction: popped entries stay on the stack, so a forward `popstate` re-lands
 * on a real entry.
 */

import { useEffect } from "react";
import { useUIStore } from "../stores/ui.ts";
import type { NavEntry } from "./nav-stack.ts";

/** Namespaced so foreign state (or a pre-refresh entry) is recognizably ours. */
const NAV_STATE_KEY = "__houstonNavIndex";

/** The stack index a history entry's state carries, or null if not ours. */
export function readNavIndex(state: unknown): number | null {
  if (typeof state !== "object" || state === null) return null;
  const value = (state as Record<string, unknown>)[NAV_STATE_KEY];
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function withNavIndex(base: unknown, index: number): Record<string, unknown> {
  const carried =
    typeof base === "object" && base !== null
      ? (base as Record<string, unknown>)
      : {};
  return { ...carried, [NAV_STATE_KEY]: index };
}

/** What the mirror compares between store notifications. */
export interface NavSnapshot {
  index: number;
  stack: readonly NavEntry[];
}

export type SyncStep =
  | { op: "push"; index: number }
  | { op: "replace"; index: number }
  | { op: "go"; delta: number };

/**
 * The store→history echo, pure for unit tests. A pop leaves the stack array's
 * identity intact (see `navigated`), which is what tells a real retreat
 * (mirror with `go`, so the browser's own back stack retreats too) apart from
 * a rebuild like `reset()` (mirror with `replace` — the browser's deeper
 * entries can't be deleted, so they decay via the clamp instead).
 */
export function syncPlan(
  prev: NavSnapshot,
  next: NavSnapshot,
): SyncStep | null {
  if (next.stack === prev.stack && next.index === prev.index) return null;
  if (next.index > prev.index) return { op: "push", index: next.index };
  if (next.index < prev.index && next.stack === prev.stack)
    return { op: "go", delta: next.index - prev.index };
  return { op: "replace", index: next.index };
}

/**
 * Wire the mirror: brand the current history entry with the current stack
 * index, echo every stack change out, and feed every `popstate` back into the
 * store. Returns an unsubscribe.
 */
export function installNavHistorySync(): () => void {
  window.history.replaceState(
    withNavIndex(window.history.state, useUIStore.getState().navIndex),
    "",
  );

  let prev: NavSnapshot = {
    index: useUIStore.getState().navIndex,
    stack: useUIStore.getState().navStack,
  };
  // True while a popstate is being applied to the store: the browser already
  // moved, so the resulting store change must not be echoed back out (a `go`
  // here would move the browser a second time).
  let applyingFromHistory = false;
  // Echoed `go` traversals whose popstate has not landed yet. Their popstate
  // must be IGNORED, not applied: the store already sits at the target, and a
  // traversal is processed asynchronously — a push that lands in between (the
  // archived → active handoff pops the panel level and re-pushes it in one
  // breath) shifts which entry the traversal resolves to, so applying its
  // event would yank the store to a place the user never went (and close the
  // panel the handoff just reopened).
  let pendingTraversals = 0;

  const unsubscribe = useUIStore.subscribe((s) => {
    const next: NavSnapshot = { index: s.navIndex, stack: s.navStack };
    const step = applyingFromHistory ? null : syncPlan(prev, next);
    prev = next;
    if (step === null) return;
    if (step.op === "push") {
      window.history.pushState(withNavIndex(null, step.index), "");
    } else if (step.op === "replace") {
      window.history.replaceState(
        withNavIndex(window.history.state, step.index),
        "",
      );
    } else {
      pendingTraversals += 1;
      window.history.go(step.delta);
    }
  });

  const onPopState = (event: PopStateEvent) => {
    if (pendingTraversals > 0) {
      // Our own echo completing (see above), never a user's back/forward.
      pendingTraversals -= 1;
      return;
    }
    applyingFromHistory = true;
    try {
      useUIStore.getState().navApplyHistory(readNavIndex(event.state) ?? 0);
    } finally {
      applyingFromHistory = false;
    }
  };
  window.addEventListener("popstate", onPopState);

  return () => {
    unsubscribe();
    window.removeEventListener("popstate", onPopState);
  };
}

/** Mount-once hook form for `App`. */
export function useNavHistorySync(): void {
  useEffect(() => installNavHistorySync(), []);
}
