import type { Agent } from "../../lib/types";
import type { AgentSettingsSection } from "./agent-settings-nav.ts";
import { AgentSettingsSectionView } from "./agent-settings-section.tsx";

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
