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
// call, deduped by toolkit) FOLLOWED BY the approval steps (one per
// integration action awaiting the user's permission). Approvals land LAST:
// approving an action happens after the toolkit it belongs to is connected.
// Any single kind alone still yields a valid sequence.
//
// `suggest_reusable` is the ONE exception to "present → needs_you": the model
// calls it on a clean finish to suggest saving the just-completed work as a
// Skill, a Routine, or a Learning, so the mission genuinely IS done. `turn-settle.ts` treats
// a lone `suggest_reusable` step as `done`, not `needs_you` — see that file's
// `finishOk`. It arrives on the same `done` frame and renders a card the same
// way; only the board-status mapping differs.

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
 *  steps, `a1`..`aN` for approval steps, `k1`..`kN` for credential steps) so
 *  each step's outcome is addressable. A `question` carries its text + optional
 *  single-select options; a `signin` asks the user to sign in to Houston with an
 *  optional user-facing reason; a `connect` names the toolkit to connect with an
 *  optional user-facing reason; an `approval` names the toolkit + action of an
 *  integration call awaiting the user's permission and, like the other blocking
 *  kinds, drives the board card to `needs_you` (present → needs_you); a
 *  `credential` asks the user to enter a custom integration's API key/token in a
 *  secure field (never into the chat) — `toolkit` is the custom integration's
 *  slug. */
export type InteractionStep =
  | {
      kind: "question";
      id: string;
      question: string;
      options?: InteractionOption[];
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
      kind: "approval";
      /** Tool-assigned id: `a1`..`aN`, in first-seen order. */
      id: string;
      /** Lowercase toolkit slug, e.g. "gmail". */
      toolkit: string;
      /** The action slug, e.g. "GMAIL_SEND_DRAFT". */
      action: string;
      /** Display-ready key/values for the card's param rows (values already truncated host-side). */
      params?: Record<string, string>;
      /** How many params were dropped past the card's row cap (present only when
       *  > 0). The card surfaces it so the user knows the hash covers settings
       *  the rows don't show. */
      paramsOmitted?: number;
      /** Stable short digest of (action, raw params), minted host-side; the one-shot allow ticket is keyed by it. */
      paramsHash: string;
    };

/** The ordered steps the mission is waiting on: question steps first (at most 3),
 *  then at most one signin step, then connect steps, then approval steps (which
 *  land last — approving happens after connecting). Always at least one step. */
export interface PendingInteraction {
  steps: InteractionStep[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** One step, structurally valid. */
export const isInteractionStep = (v: unknown): v is InteractionStep => {
  if (!isRecord(v) || typeof v.id !== "string") return false;
  if (v.kind === "question") return typeof v.question === "string";
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
  if (v.kind === "approval")
    return (
      typeof v.toolkit === "string" &&
      typeof v.action === "string" &&
      typeof v.paramsHash === "string" &&
      (v.paramsOmitted === undefined || typeof v.paramsOmitted === "number") &&
      (v.params === undefined ||
        (isRecord(v.params) &&
          Object.values(v.params).every((p) => typeof p === "string")))
    );
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
