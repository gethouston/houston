/**
 * Turn mode — the composer "Mode" selector's two states.
 *
 * `execute` is a normal turn (Houston can read, act, and change things).
 * `plan` pins a read-only planning turn: the runtime restricts the turn to
 * read-only tools and a planning overlay via the per-turn pin. An UNPINNED
 * turn is always `execute`, so `plan` only takes effect on sends that forward
 * it as `modeOverride`.
 *
 * The user's last pick is remembered per-agent in `.houston/config` (composer
 * memory only — never synced to engine Settings), so unknown/legacy values on
 * read normalize back to `execute`.
 */
export type TurnMode = "execute" | "plan";

export const DEFAULT_TURN_MODE: TurnMode = "execute";

/** Tolerant read: only the exact `"plan"` string is plan; anything else (a
 *  stale value, `undefined`, a typo) falls back to `execute`. */
export function normalizeTurnMode(value: unknown): TurnMode {
  return value === "plan" ? "plan" : "execute";
}

/**
 * The agent's remembered turn mode, for send paths that assemble their own
 * overrides (Mission Control, archived resumes) instead of holding the chat
 * panel's live pill state. A failed config read falls back to `execute` — the
 * safe default for a preference lookup; the send itself still surfaces its own
 * errors.
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
