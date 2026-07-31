import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { MissionBoard } from "../board/mission-board";
import { useAgentBoardSource } from "../board/use-agent-board-source";
import { ArchivedBoardButton } from "../shell/archived-board-button";
import ArchivedTab from "./archived-tab";

/**
 * A single agent's mission board. All the wiring lives in the shared
 * `<MissionBoard>`; this tab only builds the per-agent data source and swaps
 * the active board for the archive.
 *
 * One door each way: the floating Archived pill only shows on the active
 * board, and the archived list carries its own labelled back button in its
 * header (HOU-1043).
 */
export default function BoardTab({ agent, agentDef }: TabProps) {
  const { t } = useTranslation(["dashboard"]);
  const mode = useUIStore((s) => s.agentBoardMode);
  const setAgentBoardMode = useUIStore((s) => s.setAgentBoardMode);
  const source = useAgentBoardSource(agent, agentDef);
  const showActive = useCallback(
    () => setAgentBoardMode("active"),
    [setAgentBoardMode],
  );
  return (
    <div className="relative flex h-full flex-col">
      {mode === "archived" ? (
        <ArchivedTab agent={agent} agentDef={agentDef} onBack={showActive} />
      ) : (
        <>
          <MissionBoard source={source} />
          <ArchivedBoardButton
            label={t("dashboard:archived.button")}
            onClick={() => setAgentBoardMode("archived")}
          />
        </>
      )}
    </div>
  );
}
