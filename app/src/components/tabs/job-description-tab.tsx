import { useEffect, useState } from "react";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import {
  type AgentAdminScreen,
  targetToScreen,
} from "./agent-admin/agent-admin-nav.ts";
import { AgentAdminScreenView } from "./agent-admin/agent-admin-screen";
import { AgentAdminSidebar } from "./agent-admin/agent-admin-sidebar";

/**
 * The manager-only Agent Settings tab, a two-column master-detail admin page: a
 * slim settings nav rail ({@link AgentAdminSidebar}) on the left, the selected
 * section on the right. One section is always selected, so there is no back
 * navigation. Only agent-managers / owners (or the single-player sole user) ever
 * reach this tab, so every section is editable — the old read-only "managed
 * agent" plumbing is gone. A turn-summary file link deep-links straight into the
 * matching section via the UI store target.
 */
export default function JobDescriptionTab({ agent }: TabProps) {
  const [screen, setScreen] = useState<AgentAdminScreen>("instructions");
  const target = useUIStore((s) => s.jobDescriptionTarget);
  const setTarget = useUIStore((s) => s.setJobDescriptionTarget);

  useEffect(() => {
    if (!target) return;
    setScreen(targetToScreen(target));
    setTarget(null);
  }, [target, setTarget]);

  return (
    <div className="flex flex-1 min-h-0">
      <AgentAdminSidebar agent={agent} selected={screen} onSelect={setScreen} />
      <div className="flex flex-1 min-w-0 flex-col overflow-y-auto">
        <AgentAdminScreenView agent={agent} screen={screen} />
      </div>
    </div>
  );
}
