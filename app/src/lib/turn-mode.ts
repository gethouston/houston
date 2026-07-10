/**
 * Turn mode — the composer "Mode" selector's three states.
 *
 * `execute` is a normal turn (Houston can read, act, and change things).
 * `plan` pins a read-only planning turn: the runtime restricts the turn to
 * read-only tools and a planning overlay via the per-turn pin.
 * `auto` (Autopilot) is fire-and-forget: the runtime removes the blocking
 * tools (ask_user, request_connection) so the agent finishes the task with
 * what it has instead of pausing to ask, then reports back. An UNPINNED turn
 * is always `execute`, so `plan`/`auto` only take effect on sends that forward
 * the pin as `modeOverride`.
 *
 * The user's last pick is remembered per-agent in `.houston/config` (composer
 * memory only — never synced to engine Settings), so unknown/legacy values on
 * read normalize back to {@link DEFAULT_TURN_MODE}.
 */
export type TurnMode = "execute" | "plan" | "auto";

export const DEFAULT_TURN_MODE: TurnMode = "plan";

/** Tolerant read: the three known values pass through as-is; anything else
 *  (a stale value, `undefined`, a typo) falls back to {@link DEFAULT_TURN_MODE}. */
export function normalizeTurnMode(value: unknown): TurnMode {
  if (value === "plan") return "plan";
  if (value === "auto") return "auto";
  if (value === "execute") return "execute";
  return DEFAULT_TURN_MODE;
}

/**
 * The agent's remembered turn mode, for send paths that assemble their own
 * overrides (Mission Control, archived resumes) instead of holding the chat
 * panel's live pill state. A failed config read falls back to
 * {@link DEFAULT_TURN_MODE} — the safe default for a preference lookup; the
 * send itself still surfaces its own errors.
 */
export async function readAgentTurnMode(
  agentPath: string,
  readConfig: (path: string) => Promise<{ mode?: string }>,
): Promise<TurnMode> {
  try {
    return normalizeTurnMode((await readConfig(agentPath)).mode);
  } catch {
    return DEFAULT_TURN_MODE;
  }
}
