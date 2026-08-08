import type { Capabilities } from "@houston-ai/engine-client";
import { isMultiplayer } from "../../lib/org-roles.ts";
import type { Agent } from "../../lib/types";

/**
 * The ONE nav model for configuring a single agent.
 *
 * There is one surface now — the canonical settings page — reached through two
 * doors (Team Settings, and Settings > Permissions in multiplayer). It names
 * its rail from here, so a section can never mean two different things or be
 * gated two different ways. The per-agent Context / Admin tabs that used to
 * render their own one-group rails from `contextTabGroups` / `adminTabGroups`
 * went away with the agent tab shell, and so did those builders.
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
  | "skills";

/** The two rail groups. `context` = what the agent knows; `permissions` = what it and its team may reach. */
export type AgentSettingsGroupId = "context" | "permissions";

export interface AgentSettingsGroup {
  id: AgentSettingsGroupId;
  /** The group's sections, in rail order. Never empty in a rendered rail. */
  sections: AgentSettingsSection[];
}

/** The props EVERY section body takes. `readOnly` renders its non-manager face. */
export interface AgentSectionProps {
  agent: Agent;
  readOnly?: boolean;
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
  };

/**
 * The Context sections: the agent's job description and its learnings
 * ("Memory"). Unconditional — every agent has both, and a non-manager reads
 * them read-only.
 */
export function contextSections(): AgentSettingsSection[] {
  return ["job-description", "learnings"];
}

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
): AgentSettingsSection[] {
  if (!isMultiplayer(caps)) return [];
  return caps?.teams === true
    ? ["people", "integrations", "models"]
    : ["people"];
}

/**
 * The full settings-page rail, group by group: Context, then the access
 * sections plus Skills, which has no org gate at all (it is the per-agent
 * Skills surface every deployment ships).
 */
export function agentSettingsGroups(
  caps: Capabilities | null | undefined,
): AgentSettingsGroup[] {
  return [
    { id: "context", sections: contextSections() },
    { id: "permissions", sections: [...agentAccessSections(caps), "skills"] },
  ];
}

/** Every visible section of a rail, flattened in rail order. */
export function agentSettingsSections(
  groups: readonly AgentSettingsGroup[],
): AgentSettingsSection[] {
  return groups.flatMap((group) => group.sections);
}

/**
 * Deep-link from a turn-summary file target (a semantic file update the agent
 * wrote) into the matching Context section.
 */
export function targetToSection(
  target: "instructions" | "learnings",
): AgentSettingsSection {
  return target === "learnings" ? "learnings" : "job-description";
}
