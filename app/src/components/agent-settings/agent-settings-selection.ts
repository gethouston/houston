import {
  type AgentSettingsGroup,
  type AgentSettingsSection,
  agentSettingsSections,
  SECTION_GROUP,
} from "./agent-settings-nav.ts";

/**
 * Which section a rail actually opens on, and how a deep-link request survives
 * the window before `/v1/capabilities` lands. Pure and DOM-free so both rules
 * are unit-tested (`app/tests/agent-settings-nav.test.ts`).
 */

/**
 * The section to actually show. A deep link (or a selection held across a
 * capabilities reload) may name a section this host hides, e.g. `integrations`
 * on a multiplayer host without Teams.
 *
 * The fallback stays INSIDE the requested section's own group: an Apps request
 * is a Permissions intent, and dropping the user on the job description would
 * answer a question nobody asked. Only when that group is absent from this rail
 * (the Admin tab has no Context group) does it fall back to the first item.
 */
export function resolveAgentSettingsSection(
  groups: readonly AgentSettingsGroup[],
  requested: AgentSettingsSection | undefined,
): AgentSettingsSection {
  const sections = agentSettingsSections(groups);
  if (requested !== undefined) {
    if (sections.includes(requested)) return requested;
    const group = groups.find((g) => g.id === SECTION_GROUP[requested]);
    const first = group?.sections[0];
    if (first !== undefined) return first;
  }
  // The Context group is unconditional on the settings page, so its rail is
  // never empty; the default names the first section rather than pretending an
  // empty rail is possible.
  return sections[0] ?? "job-description";
}

/**
 * Advance the rail's selection one step, given the request still awaiting a
 * rail that can honor it.
 *
 * A request is RETAINED until it has been honored once. `/v1/capabilities`
 * lands after the first render, so a deep link into Apps would otherwise be
 * resolved away against a rail that does not yet show Apps and then never
 * re-applied — the user lands on the wrong section for the rest of the visit.
 * Once the request resolves to itself it is retired, so later caps reloads
 * never yank the user off the section they navigated to by hand.
 */
export function advanceAgentSettingsSelection(input: {
  groups: readonly AgentSettingsGroup[];
  /** The deep-link request not yet honored, if any. */
  pending: AgentSettingsSection | undefined;
  /** The section currently on screen. */
  current: AgentSettingsSection;
}): {
  selected: AgentSettingsSection;
  pending: AgentSettingsSection | undefined;
} {
  if (input.pending !== undefined) {
    const selected = resolveAgentSettingsSection(input.groups, input.pending);
    return {
      selected,
      pending: selected === input.pending ? undefined : input.pending,
    };
  }
  return {
    selected: resolveAgentSettingsSection(input.groups, input.current),
    pending: undefined,
  };
}
