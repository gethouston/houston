import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import type { TabProps } from "../../lib/types";
import {
  type AgentSettingsSection,
  adminTabGroups,
  agentSettingsSections,
} from "../agent-settings/agent-settings-nav.ts";
import { AgentSettingsRail } from "../agent-settings/agent-settings-rail";
import { AgentSettingsSectionView } from "../agent-settings/agent-settings-section";

/**
 * The Admin tab (PRODUCT-1256): who can use this agent plus its app and model
 * ceilings, in the two-column master-detail layout, on the shared
 * {@link AgentSettingsRail} (one unlabelled group here — Skills is its own
 * tab). Visible to the workspace owner and agent managers only
 * ({@link adminTabGroups} is empty outside multiplayer, where the tab is hidden
 * entirely), so its sections are always editable; `readOnly` stays wired for
 * the stale-capabilities window while `/v1/capabilities` is still loading.
 */
export default function AdminTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  const { capabilities } = useCapabilities();
  const readOnly = !isAgentManager(capabilities, agent);
  const groups = useMemo(() => adminTabGroups(capabilities), [capabilities]);
  const firstSection: AgentSettingsSection =
    agentSettingsSections(groups)[0] ?? "people";
  const [section, setSection] = useState<AgentSettingsSection>(firstSection);
  const previousAgentIdRef = useRef(agent.id);

  useEffect(() => {
    if (previousAgentIdRef.current === agent.id) return;
    previousAgentIdRef.current = agent.id;
    setSection(firstSection);
  }, [agent.id, firstSection]);

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-1 min-h-0">
      <AgentSettingsRail
        agent={agent}
        groups={groups}
        ariaLabel={t("tabLabels.admin")}
        selected={section}
        onSelect={setSection}
      />
      <div className="flex flex-1 min-w-0 flex-col overflow-y-auto">
        <AgentSettingsSectionView
          agent={agent}
          section={section}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
