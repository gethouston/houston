// Explicit `.ts` extension: `node --test --experimental-strip-types` loads this
// module directly (app/tests/mission-card.test.ts).
import { isAgentSetupMode } from "./agent-setup-mode.ts";

/**
 * The tags a mission card wears. The ONE rule both mission boards read (the
 * active board and the archive), so a mission can never be labelled one way in
 * one and another way in the other.
 *
 * A mission wears at most one tag, and only when it was not the user's own
 * doing: a routine's run, a mission the agent started for itself, or the agent's
 * own self-setup mission.
 */
export function missionCardTags({
  routineId,
  routineLabel,
  originSessionKey,
  agentStartedLabel,
  agentMode,
  setupLabel,
}: {
  routineId?: string | null;
  routineLabel: string;
  /** Present when the agent started this mission itself (PRODUCT-1244). */
  originSessionKey?: string | null;
  agentStartedLabel?: string;
  /** The activity's mode field, which carries the self-setup sentinel. */
  agentMode?: string | null;
  setupLabel?: string;
}): string[] | undefined {
  if (routineId) return [routineLabel];
  if (isAgentSetupMode(agentMode) && setupLabel) return [setupLabel];
  if (originSessionKey && agentStartedLabel) return [agentStartedLabel];
  return undefined;
}
