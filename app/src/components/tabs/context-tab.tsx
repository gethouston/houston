import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import {
  type AgentSettingsSection,
  contextTabGroups,
  targetToSection,
} from "../agent-settings/agent-settings-nav.ts";
import { AgentSettingsRail } from "../agent-settings/agent-settings-rail";
import { AgentSettingsSectionView } from "../agent-settings/agent-settings-section";

/**
 * The Context tab (PRODUCT-1256): the agent's job description and its
 * learnings, in the two-column master-detail layout — the shared
 * {@link AgentSettingsRail} on the left (one unlabelled group here), the
 * selected section on the right. One section is always selected, so there is no
 * back navigation. Non-managers see both sections read-only. A turn-summary
 * file link deep-links straight into the matching section via the UI store
 * target.
 */
export default function ContextTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  const { capabilities } = useCapabilities();
  const readOnly = !isAgentManager(capabilities, agent);
  const [section, setSection] =
    useState<AgentSettingsSection>("job-description");
  const target = useUIStore((s) => s.contextTarget);
  const setTarget = useUIStore((s) => s.setContextTarget);

  useEffect(() => {
    if (!target) return;
    setSection(targetToSection(target));
    setTarget(null);
  }, [target, setTarget]);

  return (
    <div className="flex flex-1 min-h-0">
      <AgentSettingsRail
        agent={agent}
        groups={contextTabGroups()}
        ariaLabel={t("tabLabels.context")}
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
