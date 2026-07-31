import type { PendingInteraction } from "@houston/protocol";

/**
 * Drop ONE step from a pending interaction, by id.
 *
 * The clean-finish offers are independent: the action bubbles and the
 * save-as-reusable card show side by side and are dismissed separately.
 * Dismissing one must persist the OTHER, or a reload would show neither — so
 * the write is "the interaction minus this step", never a blanket clear.
 *
 * Returns `null` when nothing survives (the caller clears the persisted
 * interaction outright) and the SAME reference when `stepId` matches nothing,
 * so a stale dismissal can't rewrite an unchanged interaction.
 *
 * Pure so the computation is unit-tested without the panel's write plumbing.
 */
export function removeInteractionStep(
  interaction: PendingInteraction,
  stepId: string,
): PendingInteraction | null {
  const steps = interaction.steps.filter((step) => step.id !== stepId);
  if (steps.length === interaction.steps.length) return interaction;
  return steps.length > 0 ? { steps } : null;
}

/** One persisted dismissal: the interaction it was computed FROM (compared by
 *  identity) and the remainder it wrote. */
export interface DismissalWrite {
  base: PendingInteraction;
  written: PendingInteraction | null;
}

/**
 * Fold ONE dismissal onto the previous one over the same interaction.
 *
 * The caller hands us the interaction it is RENDERING, which is the live
 * settle-time sequence: persisting a remainder does not rewrite it, so with
 * both offers `{a1, r1}` a naive second dismissal would compute
 * `{a1,r1} - r1 = {a1}` and resurrect the already-dismissed bubbles on reload.
 * Chaining from the previous write instead makes sequential dismissals compose:
 * `{a1,r1} → {r1} → nothing`.
 *
 * The chain is keyed on the base's OBJECT IDENTITY, not on its step ids: a
 * later turn re-arming the same ids (`a1`, `r1` are tool-assigned and repeat)
 * arrives as a fresh object and correctly starts a fresh chain. A reload starts
 * one too — there is no prior write to chain from, and the interaction being
 * rendered is by then the persisted remainder itself.
 *
 * Returns `null` when there is NOTHING to write — the step is already gone, or
 * everything was dismissed already — so the caller can skip the persist and its
 * query invalidations entirely. Pure so the composition is unit-tested without
 * the panel's write plumbing.
 */
export function foldDismissal(
  prior: DismissalWrite | null,
  interaction: PendingInteraction,
  stepId: string,
): DismissalWrite | null {
  const base = prior?.base === interaction ? prior.written : interaction;
  if (!base) return null;
  const written = removeInteractionStep(base, stepId);
  if (written === base) return null;
  return { base: interaction, written };
}
