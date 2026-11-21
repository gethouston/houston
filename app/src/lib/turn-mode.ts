/**
 * Turn mode — the composer "Mode" selector's three states.
 *
 * `execute` is a normal turn (Houston can read, act, and change things).
 * `plan` pins a read-only planning turn: the runtime restricts the turn to
 * read-only tools and a planning overlay via the per-turn pin.
 * `auto` (Autopilot) is fire-and-forget: the runtime removes ask_user so the
 * agent finishes the task with what it has instead of pausing to ask, then
 * reports back (a missing app connection still queues a connect card, which
 * ends the turn and auto-continues once connected — HOU-853). A pick while a
 * turn is RUNNING additionally applies to that turn live
 * (`tauriChat.setLiveTurnMode` — Claude Code's shift+tab semantics): the
 * runtime's executing turn adopts it at its next tool decision.
 *
 * Every new mission opens in `execute`. Once a mission exists its mode is kept
 * on its card (`Activity.mode`, HOU-205), so it survives leaving and reopening
 * the chat, a restart and the other surfaces, and a send that pins no mode (a
 * channel relay, an API follow-up) runs on it too.
 */
export type TurnMode = "execute" | "plan" | "auto";

export const DEFAULT_TURN_MODE: TurnMode = "execute";

/** Tolerant read: the three known values pass through as-is; anything else
 *  (a stale value, `undefined`, a typo) falls back to {@link DEFAULT_TURN_MODE}. */
export function normalizeTurnMode(value: unknown): TurnMode {
  if (value === "plan") return "plan";
  if (value === "auto") return "auto";
  if (value === "execute") return "execute";
  return DEFAULT_TURN_MODE;
}

/** A pick made on a card, shown until the card itself reads it back. */
export interface PickedTurnMode {
  cardId: string;
  mode: TurnMode;
}

/**
 * The mode the composer shows and every send pins.
 *
 * - A conversation backed by a card shows the card's kept mode, with this
 *   session's pick on that card winning while the write is in flight (scoped
 *   by card id, so it never leaks into another chat). A card with no mode is
 *   `fallback`, the mode the surface opens on.
 * - No card (a fresh composer, a chat no card backs) shows `localMode`, the
 *   in-session pick.
 */
export function resolveConversationTurnMode(input: {
  card: { id: string; mode?: unknown } | null;
  picked: PickedTurnMode | null;
  localMode: TurnMode;
  fallback: TurnMode;
}): TurnMode {
  const { card, picked, localMode, fallback } = input;
  if (!card) return localMode;
  if (picked?.cardId === card.id) return picked.mode;
  return card.mode === undefined ? fallback : normalizeTurnMode(card.mode);
}
