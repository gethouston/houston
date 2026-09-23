/**
 * Sentinel stored in the activity's `agent` (mode) field so every surface can
 * recognize an agent's self-setup mission (`lib/agent-setup-mission.ts`).
 * Namespaced with `houston:` so it can never collide with a user-defined
 * agent-mode id, exactly like the routine / integration / skill sentinels.
 *
 * It is deliberately NOT part of `isSetupChatMode`: that predicate hides a
 * chat from the boards, and the setup mission is a REAL mission that stays on
 * the board (it wears a "Set up" tag there). This sentinel only tells a surface
 * what kind of mission it is looking at.
 */

export const AGENT_SETUP_AGENT_MODE = "houston:agent-setup";

/** True when an activity's `agent` (mode) marks it as the self-setup mission. */
export function isAgentSetupMode(agent: string | null | undefined): boolean {
  return agent === AGENT_SETUP_AGENT_MODE;
}
