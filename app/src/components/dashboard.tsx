import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCanCreateAgents } from "../hooks/use-can-create-agents";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { MissionControlActive } from "./board/mission-control-active";
import { MissionControlArchived } from "./board/mission-control-archived";

/**
 * Mission Control: every agent's missions on one board. The active board and
 * the cross-agent Archived view are separate components that swap (not hide)
 * so only the mounted one's hooks run. This view owns the toggle + the
 * no-agents empty state; all board wiring lives in the shared `<MissionBoard>`.
 */
export function Dashboard() {
  const { t } = useTranslation("dashboard");
  const agents = useAgentStore((s) => s.agents);
  const setDialogOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const { canCreate: canCreateAgents } = useCanCreateAgents();
  const [showArchived, setShowArchived] = useState(false);

  if (agents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>{t("noAgents.title")}</EmptyTitle>
            <EmptyDescription>{t("noAgents.description")}</EmptyDescription>
          </EmptyHeader>
          {canCreateAgents && (
            <Button
              className="mt-4 rounded-full"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              {t("noAgents.cta")}
            </Button>
          )}
        </Empty>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {showArchived ? (
        <MissionControlArchived
          agents={agents}
          onShowActive={() => setShowArchived(false)}
        />
      ) : (
        <MissionControlActive
          agents={agents}
          onShowArchived={() => setShowArchived(true)}
        />
      )}
    </div>
  );
}
