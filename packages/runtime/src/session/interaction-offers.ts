import type { PendingInteraction } from "@houston/runtime-client";
import { currentInteractionHolder } from "./interaction-holder";

/**
 * Record the single plan-ready step for this turn (the model called `plan_ready`
 * in Plan mode to present its finished plan). There is at most one such step
 * (id `p1`); it OWNS the interaction exclusively (see {@link InteractionHolder.pending}).
 * The summary is trimmed. A no-op outside a turn.
 */
export function recordPlanReady(input: { summary: string }): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  holder.planReady = {
    kind: "plan_ready",
    id: "p1",
    summary: input.summary.trim(),
  };
}

/** The deterministic plan-mode completion offer when the model wrote a plan
 * without calling `plan_ready`. Kept beside `recordPlanReady` so both shapes
 * remain deliberately identical. */
export function planReadyFallback(): PendingInteraction {
  return { steps: [{ kind: "plan_ready", id: "p1", summary: "" }] };
}

/**
 * Record the single suggest-reusable step for this turn (the model called
 * `suggest_reusable` on a clean finish to offer saving the work as a Skill,
 * Routine, or Learning). There is at most one such step (id `r1`); it is FALLBACK-ONLY —
 * surfaced only when nothing else was queued this turn (see
 * {@link InteractionHolder.pending}). The title and rationale are trimmed. A
 * no-op outside a turn.
 */
export function recordSuggestReusable(input: {
  reusableKind: "skill" | "routine" | "learning";
  title: string;
  rationale: string;
}): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  holder.suggestReusable = {
    kind: "suggest_reusable",
    id: "r1",
    reusableKind: input.reusableKind,
    title: input.title.trim(),
    rationale: input.rationale.trim(),
  };
}

/** Record concrete follow-up bubbles for a completed mission. */
export function recordSuggestActions(input: {
  actions: { id: string; label: string; message: string }[];
}): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  holder.suggestActions = {
    kind: "suggest_actions",
    id: "a1",
    actions: input.actions.map((action) => ({
      id: action.id.trim(),
      label: action.label.trim(),
      message: action.message.trim(),
    })),
  };
}
