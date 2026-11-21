import type { Capabilities } from "@houston/engine-adapter";
import { isMultiplayer } from "../../lib/org-roles.ts";
import type { Agent } from "../../lib/types";

export type AgentSettingsSection =
  | "job-description"
  | "learnings"
  | "people"
  | "integrations"
  | "models"
  | "skills"
  | "delegation"
  | "manage";

type AgentSettingsGroupId = "context" | "permissions";

export interface AgentSectionProps {
  agent: Agent;
}

export const SECTION_GROUP: Record<AgentSettingsSection, AgentSettingsGroupId> =
  {
    "job-description": "context",
    learnings: "context",
    people: "permissions",
    integrations: "permissions",
    models: "permissions",
    skills: "permissions",
    delegation: "permissions",
    manage: "permissions",
  };

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

export function agentSettingsSections(
  caps: Capabilities | null | undefined,
  personalSpace = false,
): AgentSettingsSection[] {
  return [
    "manage",
    "job-description",
    "skills",
    ...(caps?.agentDelegation === true ? (["delegation"] as const) : []),
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
  delegation: "delegation.sectionTitle",
  manage: "agentSettings.manage.sectionTitle",
} as const satisfies Record<AgentSettingsSection, string>;

export function targetToSection(
  target: "instructions" | "learnings",
): AgentSettingsSection {
  return target === "learnings" ? "learnings" : "job-description";
}
