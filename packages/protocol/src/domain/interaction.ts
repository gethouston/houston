// A pending interaction: the one thing a mission is waiting on the user for.
// Recorded when the model calls ask_user / request_connection; carried on the
// terminal `done` wire frame and persisted on the Activity so the board card
// settles to `needs_you` (present) vs `done` (absent) and the UI can render a
// composer-replacing card.

export interface InteractionOption {
  id: string;
  label: string;
}

export type PendingInteraction =
  | { kind: "question"; question: string; options?: InteractionOption[] }
  | { kind: "connect"; toolkit: string; reason?: string };
