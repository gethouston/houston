import { useTranslation } from "react-i18next";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  Button,
} from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useMissionControlSource } from "./board/use-mission-control-source";
import { MissionBoard } from "./board/mission-board";

/**
 * Mission Control: every agent's missions on one board. All the wiring lives
 * in the shared `<MissionBoard>`; this view only builds the cross-agent data
 * source and handles the no-agents empty state.
 */
export function Dashboard() {
  const { t } = useTranslation("dashboard");
  const agents = useAgentStore((s) => s.agents);
  const setDialogOpen = useUIStore((s) => s.setCreateAgentDialogOpen);
  const source = useMissionControlSource(agents);

  if (agents.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>{t("noAgents.title")}</EmptyTitle>
            <EmptyDescription>{t("noAgents.description")}</EmptyDescription>
          </EmptyHeader>
          <Button className="mt-4 rounded-full" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("noAgents.cta")}
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <MissionBoard source={source} />
    </div>
  );
}
