import type { Capabilities } from "@houston/engine-adapter";
import {
  type AgentSettingsSection,
  agentAccessSections,
  agentSettingsSections,
} from "../agent-settings/agent-settings-nav.ts";

/**
 * Which rows one agent's block offers inside a team's Agents list, and whether
 * the list has to read that agent's stored policy to fill them.
 *
 * The rows ARE the agent settings rail (`agentSettingsSections`), not a second
 * list gated a second way: both doors open the same sections of the same
 * screen, so a row the rail offers and this block hides is a section with no
 * way in from the team the agent belongs to.
 *
 * Pure and DOM-free, so the visibility rules are unit-tested
 * (`app/tests/team-agent-rows-model.test.ts`).
 */
export function visibleAgentRows(
  caps: Capabilities | null | undefined,
  personalSpace = false,
): AgentSettingsSection[] {
  return agentSettingsSections(caps, personalSpace);
}

/**
 * Whether the block reads each agent's gateway-stored settings.
 *
 * Only the two CEILING rows (apps, models) are filled from that read, and only
 * a Teams host answers it — People's value is roster math the screen already
 * holds. The read is gateway-cheap (it never wakes a pod), but a roster-wide
 * fan-out for rows nobody is shown is still a request per agent for nothing.
 */
export function readsAgentPolicy(
  caps: Capabilities | null | undefined,
  personalSpace = false,
): boolean {
  return agentAccessSections(caps, personalSpace).includes("integrations");
}
