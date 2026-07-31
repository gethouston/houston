// A pending interaction: the ordered sequence of steps a mission ends a turn
// on. Recorded when the model calls ask_user / request_connection, carried on
// the terminal `done` wire frame, and persisted on the Activity so the card can
// render it. The UI renders the blocking steps as ONE composer-replacing card
// that walks the user through them one at a time, with a "1 of X" progress
// indicator.
//
// It does NOT decide the board status: every settled turn that is not a real
// failure lands `needs_you` — the engine never writes `done`, because closing a
// mission is the user's own move. The interaction is what that card SHOWS.
//
// A turn's steps are the question steps (from one ask_user call, 1 to 3
// questions) FOLLOWED BY at most one signin step (the user must sign in to
// Houston first) FOLLOWED BY the connect steps (one per request_connection
// call, deduped by toolkit). Any single kind alone still yields a valid
// sequence.
//
// `suggest_reusable` and `suggest_actions` are the non-blocking kinds: optional
// clean-finish offers, respectively for saving reusable work and for concrete
// follow-up actions. They arrive on the same `done` frame, render above the
// composer rather than replacing it, and outlive the user's later move to done.

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

/** A suggestion step: one of the two OPTIONAL clean-finish offers. They never
 *  block a mission — everything else in the union is something the mission is
 *  genuinely waiting on the user for. */
export type SuggestionStep = Extract<
  InteractionStep,
  { kind: "suggest_actions" | "suggest_reusable" }
>;
