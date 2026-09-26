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

/**
 * An employee's Tasks section: its active board or archived missions.
 *
 * The ARCHIVE is a MODE of this section (`team-archived.tsx`), reached by the
 * board toolbar's "Archived" button or by a published archived mission, and
 * left by the archive's own "Back to tasks". The
 * flag lives here, above both boards, so exactly one of them is mounted and
 * neither has to say which of two things it is.
 *
 * The FULL workspace roster goes to the board (so it reads the single warm
 * `all-conversations` query, per the one-sweep rule) and the shared
 * `MissionControlScope` narrows what it renders.
 *
 * Mounted with the employee's id as its key, so switching employees starts a
 * clean board selection.
 */
export function TeamMissionControl({ agent }: { agent: Agent }) {
  const agents = useAgentStore((s) => s.agents);
  const { t } = useTranslation("teams");
  const [archived, setArchived] = useState(false);
  const scope = useAgentBoardScope(agent);
  // The FULL roster's paths, so this is the one shared `all-conversations`
  // query every Mission Control surface already reads — the same key, no
  // second fan-out (the one-sweep rule). It is read here rather than inside
  // the board because the SURFACE decision has to happen above it: this
  // section holds only the active half of these rows.
  const rosterPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: rawConversations } = useAllConversations(rosterPaths);
  // A published target whose mission turns out to be ARCHIVED belongs on the
  // other section, so this one hands it over. The discipline is unchanged —
  // the surface is decided from the RAW sweep rows, never from a board's own
  // items, and the owning surface claims it — only the act of "show that
  // surface" changed, from a mode flip to a section change.
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
