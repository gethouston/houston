// A pending interaction: the ordered sequence of steps a mission is waiting on
// the user for. Recorded when the model calls ask_user / request_connection,
// carried on the terminal `done` wire frame, and persisted on the Activity so
// the board card settles to `needs_you` (present) vs `done` (absent). The UI
// renders it as ONE composer-replacing card that walks the user through the
// steps one at a time, with a "1 of X" progress indicator.
//
// A turn's steps are the question steps (from one ask_user call, 1 to 3
// questions) FOLLOWED BY the connect steps (one per request_connection call,
// deduped by toolkit). Either tool alone still yields a valid sequence.

export interface InteractionOption {
  id: string;
  label: string;
}

/** One step in the interaction sequence. `id` is tool-assigned (`q1`..`qN` for
 *  question steps, `c1`..`cN` for connect steps) so each step's outcome is
 *  addressable. A `question` carries its text + optional single-select options;
 *  a `connect` names the toolkit to connect with an optional user-facing reason. */
export type InteractionStep =
  | {
      kind: "question";
      id: string;
      question: string;
      options?: InteractionOption[];
    }
  | { kind: "connect"; id: string; toolkit: string; reason?: string };

/** The ordered steps the mission is waiting on: question steps first (at most 3),
 *  then connect steps. Always at least one step. */
export interface PendingInteraction {
  steps: InteractionStep[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** One step, structurally valid. */
export const isInteractionStep = (v: unknown): v is InteractionStep => {
  if (!isRecord(v) || typeof v.id !== "string") return false;
  if (v.kind === "question") return typeof v.question === "string";
  if (v.kind === "connect") return typeof v.toolkit === "string";
  return false;
};

/** Structural guard for persisted/wire data. Interactions outlive code: an
 *  activity, chat message, or localStorage entry written by an OLDER build
 *  (the pre-step `{kind, question}` / `{kind, questions}` / `{kind, toolkit}`
 *  shapes) has no `steps` and must be treated as absent, never rendered.
 *  Every seam that READS a persisted interaction goes through this guard. */
export const isPendingInteraction = (v: unknown): v is PendingInteraction =>
  isRecord(v) &&
  Array.isArray(v.steps) &&
  v.steps.length > 0 &&
  v.steps.every(isInteractionStep);
