import type { PendingInteraction } from "@houston/runtime-client";
import { currentInteractionHolder } from "./interaction-holder";

export function recordPlanReady(input: { summary: string }): void {
  const holder = currentInteractionHolder();
  if (!holder) return;
  holder.planReady = {
    kind: "plan_ready",
    id: "p1",
    summary: input.summary.trim(),
  };
}

export function planReadyFallback(): PendingInteraction {
  return { steps: [{ kind: "plan_ready", id: "p1", summary: "" }] };
}

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
