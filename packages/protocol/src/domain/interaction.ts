/**
 * The RUNTIME side of a pending interaction: the tolerant structural guards
 * every read seam goes through, and the two rules the write seams share (the
 * move-to-Done strip and the PATCH merge). The wire TYPES live next door in
 * `./interaction-types` and are re-exported here, so `@houston/protocol/interaction`
 * remains the single import for both.
 *
 * Type-only import on purpose: it is erased, which keeps this module free of
 * runtime relative imports. The app's node:test runner loads it directly by
 * subpath, and Node's ESM resolver cannot follow an extensionless `./x`.
 */

import type {
  InteractionStep,
  PendingInteraction,
  SuggestionStep,
} from "./interaction-types";

export type {
  InteractionOption,
  InteractionStep,
  PendingInteraction,
  SuggestionStep,
} from "./interaction-types";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** One step, structurally valid. */
export const isInteractionStep = (v: unknown): v is InteractionStep => {
  if (!isRecord(v) || typeof v.id !== "string") return false;
  if (v.kind === "question")
    return (
      typeof v.question === "string" &&
      (v.toolkit === undefined || typeof v.toolkit === "string")
    );
  if (v.kind === "signin")
    return v.reason === undefined || typeof v.reason === "string";
  if (v.kind === "connect") return typeof v.toolkit === "string";
  if (v.kind === "credential") return typeof v.toolkit === "string";
  if (v.kind === "plan_ready") return typeof v.summary === "string";
  if (v.kind === "suggest_reusable")
    return (
      (v.reusableKind === "skill" ||
        v.reusableKind === "routine" ||
        v.reusableKind === "learning") &&
      typeof v.title === "string" &&
      typeof v.rationale === "string"
    );
  if (v.kind === "suggest_actions")
    return (
      Array.isArray(v.actions) &&
      v.actions.length >= 2 &&
      v.actions.length <= 4 &&
      v.actions.every(
        (action) =>
          isRecord(action) &&
          typeof action.id === "string" &&
          typeof action.label === "string" &&
          typeof action.message === "string",
      )
    );
  return false;
};

/** Structural parse for persisted/wire data. Interactions outlive code, and a
 *  mixed-version peer may carry a step KIND this build no longer recognizes
 *  (e.g. a legacy `approval` step). Unknown or malformed steps are DROPPED, not
 *  fatal: the remaining valid steps still render. Returns undefined when there
 *  is no `steps` array or no valid step survives — including the pre-step
 *  `{kind, question}` / `{kind, questions}` / `{kind, toolkit}` shapes older
 *  builds wrote, which have no `steps` at all. Read seams should prefer this
 *  over the boolean guard so the dropped steps never reach the renderer. */
export const parsePendingInteraction = (
  v: unknown,
): PendingInteraction | undefined => {
  if (!isRecord(v) || !Array.isArray(v.steps)) return undefined;
  const steps = v.steps.filter(isInteractionStep);
  return steps.length > 0 ? { steps } : undefined;
};

/** Boolean guard over {@link parsePendingInteraction}: true when at least one
 *  recognized step survives. Tolerant by construction — an unknown step kind
 *  never makes a whole interaction absent. Every seam that READS a persisted
 *  interaction goes through this (or the parse). */
export const isPendingInteraction = (v: unknown): v is PendingInteraction =>
  parsePendingInteraction(v) !== undefined;

/** True for the optional clean-finish offers, false for every blocking step. */
export const isSuggestionStep = (
  step: InteractionStep,
): step is SuggestionStep =>
  step.kind === "suggest_actions" || step.kind === "suggest_reusable";

/**
 * True when EVERY step is an optional clean-finish offer — i.e. the mission is
 * not blocked on anything and the composer stays live, with the offers rendered
 * above it. The single spelling of "offers only": a surface that hand-rolls
 * `steps.every(isSuggestionStep)` and one that hand-rolls
 * `steps.some((s) => !isSuggestionStep(s))` drift apart on the empty sequence.
 * An empty sequence is NOT offers-only — there is nothing to offer.
 */
export const hasOnlySuggestionSteps = (steps: InteractionStep[]): boolean =>
  steps.length > 0 && steps.every(isSuggestionStep);

/**
 * Keep ONLY the optional clean-finish offers, dropping every blocking step.
 *
 * The rule behind a mission the user moved to Done by hand: what it was waiting
 * on is void (a Done card must never show a question stepper), but the offers
 * that came with the clean finish — "what to do next" bubbles, "save this as a
 * Skill" — stay useful and keep rendering on the Done card.
 *
 * Returns undefined when nothing survives (the caller clears the interaction).
 * Takes `unknown` so it doubles as the tolerant read of persisted data: it
 * builds on {@link parsePendingInteraction}, so malformed or unrecognized steps
 * drop the same way they do everywhere else.
 */
export const retainSuggestionSteps = (
  v: unknown,
): PendingInteraction | undefined => {
  const parsed = parsePendingInteraction(v);
  if (!parsed) return undefined;
  const steps = parsed.steps.filter(isSuggestionStep);
  return steps.length > 0 ? { steps } : undefined;
};

/** What a PATCH's `pending_interaction` field resolves to for the mission's
 *  stored value. `keep` leaves the stored interaction untouched. */
export type InteractionPatchOutcome =
  | { kind: "set"; interaction: PendingInteraction }
  | { kind: "clear" }
  | { kind: "keep" };

/**
 * The ONE rule every activity write seam applies to a patch's
 * `pending_interaction` — the host's `applyActivityUpdate`, the app's local
 * `applyActivityPatch`, and the fake host's `updateActivity` all resolve
 * through this, so the three can never drift:
 *
 *  - `null` CLEARS it (the schema has no null type, so the key is deleted).
 *  - a structurally valid object REPLACES it (a per-step dismissal writes back
 *    the remaining steps). The value is stored VERBATIM, not re-serialized from
 *    the parse, so a step kind a newer peer knows and this build doesn't
 *    survives the round-trip.
 *  - absent — or MALFORMED, which is the same thing: a payload this build
 *    cannot read says nothing about what should be stored — leaves it alone,
 *    EXCEPT on a `status: "done"` patch, which strips the blocking steps and
 *    keeps the clean-finish offers (see {@link retainSuggestionSteps}).
 *
 * Treating a malformed payload as absent rather than as "keep what's stored" is
 * load-bearing: a `{status:"done"}` patch that ALSO carried a junk interaction
 * would otherwise skip the strip and leave a question stepper on a Done card.
 *
 * `status` is the patch's status when it sets one (a plain string, like the
 * `Activity` field: unknown statuses are preserved for forward compat).
 */
export const resolveInteractionPatch = (args: {
  patched: unknown;
  stored: unknown;
  status: string | undefined;
}): InteractionPatchOutcome => {
  const { patched, stored, status } = args;
  if (patched === null) return { kind: "clear" };
  if (patched !== undefined && isPendingInteraction(patched))
    return { kind: "set", interaction: patched };
  if (status !== "done") return { kind: "keep" };
  const kept = retainSuggestionSteps(stored);
  return kept ? { kind: "set", interaction: kept } : { kind: "clear" };
};
