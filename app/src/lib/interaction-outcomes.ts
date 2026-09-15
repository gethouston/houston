/**
 * Per-step OUTCOME accounting for a walked interaction sequence.
 *
 * A connect / credential / hands-on step can be skipped, then walked Back to and
 * completed after all. The composed reply must name FINAL state, never a stale
 * "Skipped ..." line, so each step's last outcome is recorded in place and these
 * fold the map back into the ordered lists `interaction-reply.ts` speaks in.
 */

/** The shape every step kind's outcome shares: a display name, whether the step
 *  ENDED completed, and the typed "do this instead" text of a decline that
 *  carried one. */
interface StepOutcome {
  name: string;
  /** A declined step's typed "do this instead" text (the decline row). Present
   *  only on a decline WITH an instruction; a plain skip leaves it undefined. */
  message?: string;
}

/** The three ordered lists a walked sequence folds into, in step order. */
interface SplitOutcomes {
  completedNames: string[];
  skippedNames: string[];
  redirects: { name: string; text: string }[];
}

/**
 * Fold each step's FINAL outcome into completed + skipped + declined-with-
 * instruction, in step order. Keyed by step id, so recording a completion over
 * an earlier skip for the SAME step (a reconsider) — or a repeated skip —
 * yields exactly one entry per step, in exactly one list. Steps with no
 * recorded outcome (never reached) are omitted. A declined step whose typed
 * text is non-empty lands in `redirects` (it carries user text, so the sequence
 * resumes visibly); a plain skip lands in `skippedNames`.
 *
 * One fold for every kind: connect, credential and hands-on differ only in the
 * word they call "completed", so they share this loop rather than each keeping
 * a copy free to answer the same question differently.
 */
function splitOutcomes<T extends StepOutcome>(
  stepIds: string[],
  outcomes: Map<string, T>,
  completed: (outcome: T) => boolean,
): SplitOutcomes {
  const completedNames: string[] = [];
  const skippedNames: string[] = [];
  const redirects: { name: string; text: string }[] = [];
  for (const id of stepIds) {
    const outcome = outcomes.get(id);
    if (!outcome) continue;
    if (completed(outcome)) {
      completedNames.push(outcome.name);
    } else if (outcome.message != null && outcome.message.length > 0) {
      redirects.push({ name: outcome.name, text: outcome.message });
    } else {
      skippedNames.push(outcome.name);
    }
  }
  return { completedNames, skippedNames, redirects };
}

/** One connect step's FINAL outcome in a walked sequence: the app's display
 *  name and whether it ended connected (true) or skipped (false). A step skipped
 *  then reconsidered records `connected: true` — the LAST outcome for a step id
 *  wins, so the composed reply never carries a stale "Skipped ..." line. */
export interface ConnectOutcome extends StepOutcome {
  connected: boolean;
}

/** The connect steps' FINAL outcomes, in step order (see {@link splitOutcomes}). */
export function finalConnectNames(
  connectStepIds: string[],
  outcomes: Map<string, ConnectOutcome>,
): {
  connectedNames: string[];
  skippedConnectNames: string[];
  connectRedirects: { name: string; text: string }[];
} {
  const split = splitOutcomes(connectStepIds, outcomes, (o) => o.connected);
  return {
    connectedNames: split.completedNames,
    skippedConnectNames: split.skippedNames,
    connectRedirects: split.redirects,
  };
}

/** One credential step's FINAL outcome: the integration's display name and
 *  whether its key ended saved (true) or skipped (false). Mirrors
 *  {@link ConnectOutcome}. */
export interface CredentialOutcome extends StepOutcome {
  saved: boolean;
}

/** The credential steps' FINAL outcomes, in step order. */
export function finalCredentialNames(
  credentialStepIds: string[],
  outcomes: Map<string, CredentialOutcome>,
): {
  credentialedNames: string[];
  skippedCredentialNames: string[];
  credentialRedirects: { name: string; text: string }[];
} {
  const split = splitOutcomes(credentialStepIds, outcomes, (o) => o.saved);
  return {
    credentialedNames: split.completedNames,
    skippedCredentialNames: split.skippedNames,
    credentialRedirects: split.redirects,
  };
}

/** One hands-on step's FINAL outcome: the SCREEN's display name and whether the
 *  person said they finished there (true) or skipped it (false). Nothing can
 *  observe the errand, so this record is the only evidence either way. */
export interface HandsOnOutcome extends StepOutcome {
  finished: boolean;
}

/** The hands-on steps' FINAL outcomes, in step order. */
export function finalHandsOnNames(
  handsOnStepIds: string[],
  outcomes: Map<string, HandsOnOutcome>,
): {
  finishedScreens: string[];
  skippedScreens: string[];
  handsOnRedirects: { name: string; text: string }[];
} {
  const split = splitOutcomes(handsOnStepIds, outcomes, (o) => o.finished);
  return {
    finishedScreens: split.completedNames,
    skippedScreens: split.skippedNames,
    handsOnRedirects: split.redirects,
  };
}
