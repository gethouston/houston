import { useTranslation } from "react-i18next";
import type { TabProps } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { MissionBoard } from "../board/mission-board";
import { useAgentBoardSource } from "../board/use-agent-board-source";
import { ArchivedToggleButton } from "../shell/archived-toggle-button";
import ArchivedTab from "./archived-tab";

/**
 * A single agent's mission board. All the wiring lives in the shared
 * `<MissionBoard>`; this tab only builds the per-agent data source and
 * floats the archived toggle over whichever surface is showing.
 */
export default function BoardTab({ agent, agentDef }: TabProps) {
  const { t } = useTranslation(["dashboard"]);
  const mode = useUIStore((s) => s.agentBoardMode);
  const setAgentBoardMode = useUIStore((s) => s.setAgentBoardMode);
  const source = useAgentBoardSource(agent, agentDef);
  return (
    <div className="relative flex h-full flex-col">
      {mode === "archived" ? (
        <ArchivedTab agent={agent} agentDef={agentDef} />
      ) : (
        <MissionBoard source={source} />
      )}
      <ArchivedToggleButton
        archived={mode === "archived"}
        label={t("dashboard:archived.button")}
        onToggle={() =>
          setAgentBoardMode(mode === "archived" ? "active" : "archived")
        }
      />
    </div>
  );
}
