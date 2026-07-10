import type { Routine, TriggerStatusItem } from "@houston-ai/engine-client";

/**
 * Pure read-model helpers the Routines tab uses to feed the grid's trigger
 * surface (C9 event-driven routines): the per-routine status lookup and the
 * humanized "wakes on an event in {app}" summaries. Kept DOM/React-free so they
 * unit-test under bare node.
 */

/** Index a trigger-status list by routine id (empty when the host serves none). */
export function toStatusMap(
  items: TriggerStatusItem[] | null | undefined,
): Record<string, TriggerStatusItem> {
  const out: Record<string, TriggerStatusItem> = {};
  for (const item of items ?? []) out[item.routine_id] = item;
  return out;
}

/**
 * Build a human event summary per trigger routine. `appName` resolves a toolkit
 * slug to its display name; `render` turns that name into the localized line
 * (the app passes a `t()` closure). Schedule-only routines are skipped.
 */
export function toTriggerSummaries(
  routines: Routine[],
  appName: (toolkit: string) => string,
  render: (app: string) => string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of routines) {
    if (r.trigger) out[r.id] = render(appName(r.trigger.toolkit));
  }
  return out;
}
