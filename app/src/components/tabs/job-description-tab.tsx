import { useEffect, useRef, useState } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import {
  type AgentAdminScreen,
  targetToScreen,
} from "./agent-admin/agent-admin-nav.ts";
import { AgentAdminScreenView } from "./agent-admin/agent-admin-screen";
import { AgentAdminSidebar } from "./agent-admin/agent-admin-sidebar";

/**
 * The Agent Settings tab, a two-column master-detail admin page: a
 * slim settings nav rail ({@link AgentAdminSidebar}) on the left, the selected
 * section on the right. One section is always selected, so there is no back
 * navigation. Managers see the configuration and access sections. Teams members
 * see the access sections only, read-only. A turn-summary file link deep-links
 * straight into a manager's matching section via the UI store target.
 */
export default function JobDescriptionTab({ agent }: TabProps) {
  const { capabilities } = useCapabilities();
  const readOnly = !isAgentManager(capabilities, agent);
  const [screen, setScreen] = useState<AgentAdminScreen>(
    readOnly ? "people" : "instructions",
  );
  const target = useUIStore((s) => s.jobDescriptionTarget);
  const setTarget = useUIStore((s) => s.setJobDescriptionTarget);
  const previousAgentIdRef = useRef(agent.id);

  useEffect(() => {
    if (previousAgentIdRef.current === agent.id && !readOnly) return;
    previousAgentIdRef.current = agent.id;
    if (readOnly) setScreen("people");
  }, [agent.id, readOnly]);

  useEffect(() => {
    if (!target) return;
    if (!readOnly) setScreen(targetToScreen(target));
    setTarget(null);
  }, [readOnly, target, setTarget]);

  return (
    <div className="flex flex-1 min-h-0">
      <AgentAdminSidebar
        agent={agent}
        selected={screen}
        onSelect={setScreen}
        readOnly={readOnly}
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
