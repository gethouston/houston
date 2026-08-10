import type { Agent } from "../../lib/types";
import type { AgentSettingsSection } from "./agent-settings-nav.ts";
import { AgentSettingsSectionView } from "./agent-settings-section.tsx";

/**
 * The ONE canonical agent settings page: everything an admin configures on a
 * single agent. The drilled screen owns navigation and passes the selected
 * section here, while this component remains the one body registry.
 *
 * It carries NO authority of its own: `readOnly` is the caller's decision and
 * the gateway is the sole enforcer.
 */
export function AgentSettingsPage({
  agent,
  section,
  readOnly = false,
}: {
  agent: Agent;
  section: AgentSettingsSection;
  /** View-only: every section renders its non-manager face. */
  readOnly?: boolean;
}) {
  return (
    <div data-agent-section-body={section}>
      <AgentSettingsSectionView
        agent={agent}
        section={section}
        readOnly={readOnly}
      />
    </div>
  );
}
