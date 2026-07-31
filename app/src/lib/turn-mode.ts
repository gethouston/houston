/**
 * Turn mode — the composer "Mode" selector's three states.
 *
 * `execute` is a normal turn (Houston can read, act, and change things).
 * `plan` pins a read-only planning turn: the runtime restricts the turn to
 * read-only tools and a planning overlay via the per-turn pin.
 * `auto` (Autopilot) is fire-and-forget: the runtime removes ask_user so the
 * agent finishes the task with what it has instead of pausing to ask, then
 * reports back (a missing app connection still queues a connect card, which
 * ends the turn and auto-continues once connected — HOU-853). An UNPINNED turn
 * is always `execute`, so `plan`/`auto` only take effect on sends that forward
 * the pin as `modeOverride`. A pick while a turn is RUNNING additionally
 * applies to that turn live (`tauriChat.setLiveTurnMode` — Claude Code's
 * shift+tab semantics): the runtime's executing turn adopts it at its next
 * tool decision.
 *
 * Mode is session-local and defaults to `execute` for every new mission. A
 * user's in-session pick applies to subsequent sends in that session only.
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
