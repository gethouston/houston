import { Button } from "@houston-ai/core";
import { Archive } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllConversations } from "../../hooks/queries";
import type { BoardSurface } from "../../lib/board-surface-nav";
import type { TeamView } from "../../lib/teams-model";
import { useAgentStore } from "../../stores/agents";
import { useRegisterTaskListArchive } from "../board/task-list-chrome";
import { useBoardSurfaceOnNav } from "../board/use-board-surface-on-nav";
import { TeamArchived } from "./team-archived";
import { TeamMissionEmpty } from "./team-empty";
import { TeamMissionBoard } from "./team-mission-board";
import { useTeamBoardScope } from "./use-team-board-scope";

/**
 * A team's Tasks section: the team's active board, or the honest empty state
 * when the team holds no agents.
 *
 * The ARCHIVE is a MODE of this section (`team-archived.tsx`), reached by the
 * board toolbar's "Archived" button on desktop and by the drilled header's
 * "…" menu on the phone, and left by the archive's own "Back to tasks". The
 * flag lives here, above both boards, so exactly one of them is mounted and
 * neither has to say which of two things it is.
 *
 * The FULL workspace roster goes to the board (so it reads the single warm
 * `all-conversations` query, per the one-sweep rule) and the shared
 * `MissionControlScope` narrows what it renders.
 *
 * Mounted with the team's id as its key, so switching teams starts a clean
 * board instead of carrying the previous team's selection across.
 */
export function TeamMissionControl({
  team,
  agentFocusId,
}: {
  team: TeamView;
  agentFocusId?: string;
}) {
  const agents = useAgentStore((s) => s.agents);
  const { t } = useTranslation("teams");
  const [archived, setArchived] = useState(false);
  // Before the empty-team return: hooks may not run conditionally.
  const scope = useTeamBoardScope(team, agentFocusId);
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

  // The phone header's "…" menu opens this archive; it lives a level up, so
  // the switch is published rather than passed. Withdrawn where there is
  // nothing to open — an agent-less team, or the archive already on screen,
  // which carries its own "Back to tasks".
  const showArchive = useCallback(() => setArchived(true), []);
  useRegisterTaskListArchive(
    team.agents.length === 0 || archived ? null : showArchive,
  );

  if (team.agents.length === 0) return <TeamMissionEmpty team={team} />;

  if (archived) {
    return <TeamArchived team={team} onShowActive={() => setArchived(false)} />;
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
