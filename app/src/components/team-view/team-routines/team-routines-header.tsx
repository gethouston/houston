import { Badge } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../../lib/types";
import { AgentFilterMenu } from "../../agent-filter-menu";
import { teamFilterAgentId, teamFilterPath } from "../team-agent-filter-model";

/**
 * The team Routines list's header band: what this list is, how many rows it
 * holds, whose routines it is showing, and the one way to add another.
 *
 * Two decisions live here.
 *
 * The band stays even when the list is EMPTY, unlike the per-agent tab's, which
 * drops it: the agent dropdown is the only way back out of a filter that
 * emptied the section, so hiding it would be a dead end.
 *
 * Its CREATE button does step aside when the grid is showing its EMPTY state,
 * which carries the same button: two identical filled pills on one screen is not
 * a choice the user has, it is the same act twice. The caller decides, by
 * passing no button — the grid stops being empty the moment a DRAFT row lands,
 * and the header has to take the button back then.
 *
 * The dropdown reads and writes the ONE `teamAgentFilter` pin that the rail's
 * agent rows and the team board's own filter menu use, so all three are the
 * same act. `teamFilterPath` / `teamFilterAgentId` are the pure translations
 * between the store's agent ID and the folder path a filter menu speaks.
 */
export function TeamRoutinesHeader({
  agents,
  pinnedAgentId,
  onPinAgent,
  count,
  createButton,
}: {
  /** The whole team: the dropdown offers every member, not just the shown one. */
  agents: Agent[];
  pinnedAgentId: string | null;
  onPinAgent: (agentId: string | null) => void;
  /** Created routines in the list. Zero hides the badge (a draft is not one). */
  count: number;
  /** The create action, or nothing while the grid's empty state carries it. */
  createButton?: ReactNode;
}) {
  const { t } = useTranslation("routines");

  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-3">
      <h2 className="text-sm font-medium text-ink">{t("listTitle")}</h2>
      {count > 0 && (
        <Badge variant="secondary" className="tabular-nums">
          {count}
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <AgentFilterMenu
          agents={agents}
          filterPath={teamFilterPath(agents, pinnedAgentId)}
          onFilterPathChange={(path) =>
            onPinAgent(teamFilterAgentId(agents, path))
          }
        />
        {createButton}
      </div>
    </div>
  );
}
