import type { Agent } from "../../lib/types";
import type { AgentSettingsSection } from "./agent-settings-nav.ts";
import { AgentSettingsSectionView } from "./agent-settings-section.tsx";

/**
 * The ONE canonical agent settings page: everything a manager configures on a
 * single agent. The drilled screen owns navigation and passes the selected
 * section here, while this component remains the one body registry.
 *
 * It carries NO authority of its own: reaching it is the caller's gate
 * (`visibleAgentSections`) and the gateway is the sole enforcer.
 */
export function AgentSettingsPage({
  agent,
  section,
}: {
  agent: Agent;
  section: AgentSettingsSection;
}) {
  return (
    <div data-agent-section-body={section}>
      <AgentSettingsSectionView agent={agent} section={section} />
    </div>
  );
}
