import {
  type AgentSettingsSection,
  SECTION_GROUP,
} from "./agent-settings-nav.ts";

export function resolveAgentSettingsSection(
  sections: readonly AgentSettingsSection[],
  requested: AgentSettingsSection | undefined,
): AgentSettingsSection {
  if (requested !== undefined) {
    if (sections.includes(requested)) return requested;
    const first = sections.find(
      (section) => SECTION_GROUP[section] === SECTION_GROUP[requested],
    );
    if (first !== undefined) return first;
  }
  if (sections.includes("manage")) return "manage";
  return sections[0] ?? "job-description";
}

export function advanceAgentSettingsSelection(input: {
  sections: readonly AgentSettingsSection[];
  pending: AgentSettingsSection | undefined;
  current: AgentSettingsSection;
}): {
  selected: AgentSettingsSection;
  pending: AgentSettingsSection | undefined;
} {
  if (input.pending !== undefined) {
    const selected = resolveAgentSettingsSection(input.sections, input.pending);
    return {
      selected,
      pending: selected === input.pending ? undefined : input.pending,
    };
  }
  return {
    selected: resolveAgentSettingsSection(input.sections, input.current),
    pending: undefined,
  };
}
