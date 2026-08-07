import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import {
  type AgentAdminScreen,
  contextScreens,
  targetToScreen,
} from "./agent-admin/agent-admin-nav.ts";
import { AgentAdminScreenView } from "./agent-admin/agent-admin-screen";
import { AgentAdminSidebar } from "./agent-admin/agent-admin-sidebar";

/**
 * The Context tab (PRODUCT-1256): the agent's job description (instructions)
 * and its learnings, in the two-column master-detail layout — a slim nav rail
 * ({@link AgentAdminSidebar}) on the left, the selected section on the right.
 * One section is always selected, so there is no back navigation. Non-managers
 * see both sections read-only. A turn-summary file link deep-links straight
 * into the matching section via the UI store target.
 */
export default function ContextTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  const { capabilities } = useCapabilities();
  const readOnly = !isAgentManager(capabilities, agent);
  const [screen, setScreen] = useState<AgentAdminScreen>("instructions");
  const target = useUIStore((s) => s.contextTarget);
  const setTarget = useUIStore((s) => s.setContextTarget);

  useEffect(() => {
    if (!target) return;
    setScreen(targetToScreen(target));
    setTarget(null);
  }, [target, setTarget]);

  return (
    <div className="flex flex-1 min-h-0">
      <AgentAdminSidebar
        agent={agent}
        rows={contextScreens()}
        ariaLabel={t("tabLabels.context")}
        selected={screen}
        onSelect={setScreen}
      />
      <div className="flex flex-1 min-w-0 flex-col overflow-y-auto">
        <AgentAdminScreenView
          agent={agent}
          screen={screen}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
