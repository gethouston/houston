import type { PendingInteraction } from "@houston/protocol";

export function removeInteractionStep(
  interaction: PendingInteraction,
  stepId: string,
): PendingInteraction | null {
  const steps = interaction.steps.filter((step) => step.id !== stepId);
  if (steps.length === interaction.steps.length) return interaction;
  return steps.length > 0 ? { steps } : null;
}

export interface DismissalWrite {
  base: PendingInteraction;
  written: PendingInteraction | null;
}

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
