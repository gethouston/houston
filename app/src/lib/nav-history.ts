import { useEffect } from "react";
import { useUIStore } from "../stores/ui.ts";
import type { NavEntry } from "./nav-stack.ts";

const NAV_STATE_KEY = "__houstonNavIndex";

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

export interface NavSnapshot {
  index: number;
  stack: readonly NavEntry[];
}

export type SyncStep =
  | { op: "push"; index: number }
  | { op: "replace"; index: number }
  | { op: "go"; delta: number };

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

export function installNavHistorySync(): () => void {
  window.history.replaceState(
    withNavIndex(window.history.state, useUIStore.getState().navIndex),
    "",
  );

  let prev: NavSnapshot = {
    index: useUIStore.getState().navIndex,
    stack: useUIStore.getState().navStack,
  };
  let applyingFromHistory = false;
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

export function useNavHistorySync(): void {
  useEffect(() => installNavHistorySync(), []);
}
