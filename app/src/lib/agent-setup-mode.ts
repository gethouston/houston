/**
 * The app's name for the setup task's mode sentinel: an AI Employee's first
 * day is a mission whose activity `agent` (mode) field carries it. The value
 * lives once in `@houston/domain`, where the host stamps it on the task.
 *
 * It is deliberately NOT part of `isSetupChatMode`: that predicate hides a
 * chat from the boards, and the setup task is a REAL mission that stays on the
 * board (it wears a "Set up" tag there).
 */

export {
  AGENT_SETUP_AGENT_MODE,
  isAgentSetupMode,
} from "@houston/sdk/first-day";
