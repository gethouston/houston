import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import type { TabProps } from "../../lib/types";
import {
  type AgentAdminScreen,
  adminScreens,
} from "./agent-admin/agent-admin-nav.ts";
import { AgentAdminScreenView } from "./agent-admin/agent-admin-screen";
import { AgentAdminSidebar } from "./agent-admin/agent-admin-sidebar";

/**
 * The Admin tab (PRODUCT-1256): who can use this agent plus its app and model
 * ceilings, in the two-column master-detail layout. Visible to the workspace
 * owner and agent managers only ({@link adminScreens} is empty outside
 * multiplayer, where the tab is hidden entirely), so its sections are always
 * editable; `readOnly` stays wired for the stale-capabilities window while
 * `/v1/capabilities` is still loading.
 */
export default function AdminTab({ agent }: TabProps) {
  const { t } = useTranslation("agents");
  const { capabilities } = useCapabilities();
  const readOnly = !isAgentManager(capabilities, agent);
  const rows = adminScreens(capabilities);
  const firstRow = rows[0] ?? "people";
  const [screen, setScreen] = useState<AgentAdminScreen>(firstRow);
  const previousAgentIdRef = useRef(agent.id);

  useEffect(() => {
    if (previousAgentIdRef.current === agent.id) return;
    previousAgentIdRef.current = agent.id;
    setScreen(firstRow);
  }, [agent.id, firstRow]);

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-1 min-h-0">
      <AgentAdminSidebar
        agent={agent}
        rows={rows}
        ariaLabel={t("tabLabels.admin")}
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
