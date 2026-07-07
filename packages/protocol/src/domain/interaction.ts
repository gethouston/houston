// A pending interaction: the one thing a mission is waiting on the user for.
// Recorded when the model calls ask_user / request_connection; carried on the
// terminal `done` wire frame and persisted on the Activity so the board card
// settles to `needs_you` (present) vs `done` (absent) and the UI can render a
// composer-replacing card.
//
// `ask_user` batches everything it needs into ONE call: the `question` variant
// carries 1 to 3 questions, each with its own optional single-select options,
// rendered as one interactive card in place of the composer.

export interface InteractionOption {
  id: string;
  label: string;
}

/** One question in a batched `ask_user` card. `id` is tool-assigned (`q1`..`qN`)
 *  so the answer for each question is addressable; `options`, when present, are
 *  the single-select choices offered for that question. */
export interface InteractionQuestion {
  id: string;
  question: string;
  options?: InteractionOption[];
}

export type PendingInteraction =
  | { kind: "question"; questions: InteractionQuestion[] }
  | { kind: "connect"; toolkit: string; reason?: string };
