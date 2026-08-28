import { CatalogSearchField, cn } from "@houston-ai/core";
import { SquarePen } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { startNewMission } from "../../lib/new-mission";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";

const chipClass =
  "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

/**
 * The phone board's control row, rendered by `<MissionBoard>` above the paged
 * board below md only: the search field, the compose control, the section's
 * archived toggle, and — when the board spans several agents — an agent
 * filter bar defaulting to "All agents". The filter writes the same
 * `teamAgentFilter` pin the team strip's breadcrumb and the sidebar rows
 * write, so the phone chips and the desktop dropdown are one act.
 */
export function MobileBoardControls({
  search,
  isSearchingText,
  onSearchChange,
  agents,
  filterPath,
  modeToggle,
}: {
  search: string;
  isSearchingText: boolean;
  onSearchChange: (value: string) => void;
  /** The board's own agents — the filter bar's roster. */
  agents: Agent[];
  /** The applied agent filter, `""` for every agent in scope. */
  filterPath: string;
  /** The section's archived toggle, owned by the section like on desktop. */
  modeToggle?: ReactNode;
}) {
  const { t } = useTranslation(["dashboard", "shell"]);
  const setTeamAgentFilter = useUIStore((s) => s.setTeamAgentFilter);

  return (
    <div
      data-testid="mobile-board-controls"
      className="flex shrink-0 flex-col gap-2 px-3 pt-2"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <CatalogSearchField
            value={search}
            busy={isSearchingText}
            label={t("dashboard:search.placeholder")}
            labelShort={t("dashboard:search.placeholderShort")}
            clearLabel={t("dashboard:search.clear")}
            busyLabel={t("dashboard:search.searchingText")}
            className="w-full"
            onChange={onSearchChange}
          />
        </div>
        {modeToggle}
        <button
          type="button"
          aria-label={t("shell:sidebar.newMission")}
          onClick={startNewMission}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors active:scale-95 hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
        >
          <SquarePen className="size-5" />
        </button>
      </div>
      {agents.length > 1 && (
        <div
          data-testid="mobile-board-agent-filter"
          className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]"
        >
          <button
            type="button"
            aria-pressed={filterPath === ""}
            onClick={() => setTeamAgentFilter(null)}
            className={cn(
              chipClass,
              filterPath === ""
                ? "bg-action text-action-text"
                : "bg-chip text-ink-muted",
            )}
          >
            {t("dashboard:filter.allAgents")}
          </button>
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              aria-pressed={filterPath === agent.folderPath}
              onClick={() => setTeamAgentFilter(agent.folderPath)}
              className={cn(
                chipClass,
                filterPath === agent.folderPath
                  ? "bg-action text-action-text"
                  : "bg-chip text-ink-muted",
              )}
            >
              {agent.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
