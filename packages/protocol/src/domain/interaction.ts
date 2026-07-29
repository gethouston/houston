// A pending interaction: the ordered sequence of steps a mission is waiting on
// the user for. Recorded when the model calls ask_user / request_connection,
// carried on the terminal `done` wire frame, and persisted on the Activity so
// the board card settles to `needs_you` (present) vs `done` (absent). The UI
// renders it as ONE composer-replacing card that walks the user through the
// steps one at a time, with a "1 of X" progress indicator.
//
// A turn's steps are the question steps (from one ask_user call, 1 to 3
// questions) FOLLOWED BY at most one signin step (the user must sign in to
// Houston first) FOLLOWED BY the connect steps (one per request_connection
// call, deduped by toolkit). Any single kind alone still yields a valid
// sequence.
//
// `suggest_reusable` and `suggest_actions` are exceptions to "present →
// needs_you": they are optional clean-finish offers, respectively for saving
// reusable work and for concrete follow-up actions. Any mix of those two offer
// kinds settles `done`; a sequence with any blocking step settles `needs_you`.
// They arrive on the same `done` frame and render above the composer.

export interface InteractionOption {
  id: string;
  label: string;
  /** One muted line of consequence or benefit shown after the label. */
  description?: string;
  /** Mark AT MOST one option as the suggested default. */
  recommended?: boolean;
}

/** One step in the interaction sequence. `id` is tool-assigned (`q1`..`qN` for
 *  question steps, `s1` for the single signin step, `c1`..`cN` for connect
 *  steps, `k1`..`kN` for credential steps) so each step's outcome is
 *  addressable. A `question` carries its text + optional single-select options,
 *  plus an optional `toolkit` slug that brands the card with a connected app's
 *  logo (set when the question confirms an app action); a `signin` asks the user
 *  to sign in to Houston with an optional user-facing reason; a `connect` names
 *  the toolkit to connect with an optional user-facing reason; a `credential`
 *  asks the user to enter a custom integration's API key/token in a secure field
 *  (never into the chat) — `toolkit` is the custom integration's slug. */
export type InteractionStep =
  | {
      kind: "question";
      id: string;
      question: string;
      options?: InteractionOption[];
      /** Lowercase toolkit slug (e.g. "gmail") when the question concerns a
       *  connected app: the card shows that app's logo. */
      toolkit?: string;
    }
  | { kind: "signin"; id: string; reason?: string }
  | { kind: "connect"; id: string; toolkit: string; reason?: string }
  | { kind: "credential"; id: string; toolkit: string; reason?: string }
  | { kind: "plan_ready"; id: string; summary: string }
  | {
      kind: "suggest_reusable";
      id: string;
      reusableKind: "skill" | "routine" | "learning";
      title: string;
      rationale: string;
    }
  | {
      kind: "suggest_actions";
      id: string;
      actions: { id: string; label: string; message: string }[];
    };

/** The ordered steps the mission is waiting on: question steps first (at most 3),
 *  then at most one signin step, then connect steps. Always at least one step. */
export interface PendingInteraction {
  steps: InteractionStep[];
}

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
