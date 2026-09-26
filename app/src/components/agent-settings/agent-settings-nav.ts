import type { Capabilities } from "@houston/engine-adapter";
import { isMultiplayer } from "../../lib/org-roles.ts";
import type { Agent } from "../../lib/types";

/**
 * The ONE nav model for configuring a single agent.
 *
 * One surface, the canonical settings page, is reached through two doors (the
 * employee's own Settings section, and Settings > Permissions in multiplayer).
 * It names its rail from here, so a section can never mean two different
 * things or be gated two different ways.
 *
 * Pure and DOM-free, so the visibility rules are unit-tested
 * (`app/tests/agent-settings-nav.test.ts`).
 */
export type AgentSettingsSection =
  | "job-description"
  | "learnings"
  | "people"
  | "integrations"
  | "models"
  | "skills"
  | "manage";

/** The two semantic groups used only to keep hidden deep links nearby. */
type AgentSettingsGroupId = "context" | "permissions";

/** The props EVERY section body takes. */
export interface AgentSectionProps {
  agent: Agent;
}

/**
 * Which group a section belongs to, independent of any host's capabilities.
 * The deep-link fallback reads it so a hidden section lands on its own group's
 * first item rather than answering an unrelated question.
 */
export const SECTION_GROUP: Record<AgentSettingsSection, AgentSettingsGroupId> =
  {
    "job-description": "context",
    learnings: "context",
    people: "permissions",
    integrations: "permissions",
    models: "permissions",
    skills: "permissions",
    manage: "permissions",
  };

/**
 * The ACCESS sections: who may use the agent, plus the app + model ceilings.
 * People needs multiplayer (single player has no roster to manage); the two
 * ceilings additionally need a Teams-capable host. Empty outside multiplayer,
 * which is why a single-player rail is Context plus Skills and nothing else.
 * The public-API "Connect" card (C10, `capabilities.apiKeys`) was removed from
 * this surface (HOU-806): connecting external apps is a Routines concern now.
 */
export function agentAccessSections(
  caps: Capabilities | null | undefined,
  personalSpace = false,
): AgentSettingsSection[] {
  if (personalSpace) return [];
  if (!isMultiplayer(caps)) return [];
  return caps?.teams === true
    ? ["people", "integrations", "models"]
    : ["people"];
}

/**
 * The full settings-page cluster: how the agent is MANAGED first (the page's
 * one door is administering it, so Settings leads the rail and is the landing
 * section), then what the agent IS (job description), what it can DO (skills),
 * what it has LEARNED, and who may reach it (the access sections). Skills has
 * no org gate at all (it is the per-agent Skills surface every deployment
 * ships).
 *
 * There is no per-caller gate here, because the PAGE carries it: its one door
 * is the agent's own Settings section, which only an agent-manager is offered
 * (`visibleAgentSections`). Everyone who reads this list manages the agent.
 */
export function agentSettingsSections(
  caps: Capabilities | null | undefined,
  personalSpace = false,
): AgentSettingsSection[] {
  return [
    "manage",
    "job-description",
    "skills",
    "learnings",
    ...agentAccessSections(caps, personalSpace),
  ];
}

export const SECTION_TITLES = {
  "job-description": "agents:subTabs.instructions",
  learnings: "agentAdmin.rows.knowledge.title",
  people: "agentAdmin.rows.people.title",
  integrations: "agentAdmin.rows.integrations.title",
  models: "agentAdmin.rows.model.title",
  skills: "agents:subTabs.skills",
  manage: "agentSettings.manage.sectionTitle",
} as const satisfies Record<AgentSettingsSection, string>;

/**
 * Deep-link from a turn-summary file target (a semantic file update the agent
 * wrote) into the matching Context section.
 */
export function targetToSection(
  target: "instructions" | "learnings",
): AgentSettingsSection {
  return target === "learnings" ? "learnings" : "job-description";
}
