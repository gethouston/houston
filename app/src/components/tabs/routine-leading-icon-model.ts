import type { Routine } from "@houston-ai/engine-client";

/**
 * The Automations grid's per-row leading glyph, decided purely from the
 * routine's wake binding (kept DOM/React-free so it unit-tests under bare
 * node; the `.tsx` hook turns each descriptor into the actual element):
 *
 *  - `schedule` — a cron routine; the grid keeps its default clock glyph.
 *  - `webhook`  — an incoming-webhook trigger; a webhook mark.
 *  - `composio` — an app-event trigger; the triggering app's logo, resolved
 *                 from its `toolkit` slug against the integrations catalog.
 *
 * A trigger with no `kind` is a Composio binding (the original, pre-webhook
 * shape), so it falls through to `composio` with its toolkit slug.
 */
export type RoutineLeadingIcon =
  | { kind: "schedule" }
  | { kind: "webhook" }
  | { kind: "composio"; toolkit: string };

export function routineLeadingIcon(routine: Routine): RoutineLeadingIcon {
  const trigger = routine.trigger;
  if (!trigger) return { kind: "schedule" };
  if (trigger.kind === "webhook") return { kind: "webhook" };
  return { kind: "composio", toolkit: trigger.toolkit };
}
