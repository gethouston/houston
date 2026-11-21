import { Button } from "@houston-ai/core";
import { Archive } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../../hooks/queries";
import type { BoardSurface } from "../../lib/board-surface-nav";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useBoardSurfaceOnNav } from "../board/use-board-surface-on-nav";
import { TeamArchived } from "./team-archived";
import { TeamMissionBoard } from "./team-mission-board";
import { useAgentBoardScope } from "./use-agent-board-scope";

export function TeamMissionControl({ agent }: { agent: Agent }) {
  const agents = useAgentStore((s) => s.agents);
  const { t } = useTranslation("teams");
  const [archived, setArchived] = useState(false);
  const scope = useAgentBoardScope(agent);
  const rosterPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: rawConversations } = useAllConversations(rosterPaths);
  const show = useCallback((surface: BoardSurface) => {
    if (surface === "active") return;
    setArchived(true);
  }, []);
  useBoardSurfaceOnNav({ rows: rawConversations, show });

  if (archived) {
    return (
      <TeamArchived agent={agent} onShowActive={() => setArchived(false)} />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TeamMissionBoard
        agents={agents}
        scope={scope}
        modeToggle={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setArchived(true)}
            data-tour-target="archivedMissions"
          >
            <Archive className="size-4" />
            {t("teamView.archive.open")}
          </Button>
        }
      />
    </div>
  );
}
