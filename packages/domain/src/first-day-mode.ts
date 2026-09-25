/**
 * The sentinel an AI Employee's setup task (its first day) carries in its
 * activity's `agent` (mode) field, so every surface can recognize it.
 * Namespaced with `houston:` so it can never collide with a user-defined
 * agent-mode id, exactly like the routine / integration / skill sentinels.
 *
 * It is NOT a hidden setup chat: the setup task is a real mission that stays
 * on the board. The sentinel only says what kind of mission it is.
 */
export const AGENT_SETUP_AGENT_MODE = "houston:agent-setup";

/** True when an activity's `agent` (mode) marks it as the setup task. */
export function isAgentSetupMode(agent: string | null | undefined): boolean {
  return agent === AGENT_SETUP_AGENT_MODE;
}
