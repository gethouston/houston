import { CatalogSearchField, cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";

const chipClass =
  "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

/**
 * The phone board's control row, rendered by `<MissionBoard>` above the paged
 * board below md only: the search field, the section's archived toggle, and
 * — when the board spans several agents — an agent filter bar defaulting to
 * "All agents". The filter writes the same `teamAgentFilter` pin the team
 * strip's breadcrumb and the sidebar rows write, so the phone chips and the
 * desktop dropdown are one act.
 *
 * No compose control here: the top bar already carries the phone's compose,
 * and the Running page leads with the board's own scoped "+"
 * (`phone-compose.ts`). A third would only crowd the row.
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
  const { t } = useTranslation("dashboard");
  const setTeamAgentFilter = useUIStore((s) => s.setTeamAgentFilter);

  return (
    <div
      data-testid="mobile-board-controls"
      className="flex shrink-0 flex-col gap-2 px-3 pt-3"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <CatalogSearchField
            value={search}
            busy={isSearchingText}
            label={t("search.placeholder")}
            labelShort={t("search.placeholderShort")}
            clearLabel={t("search.clear")}
            busyLabel={t("search.searchingText")}
            className="w-full"
            onChange={onSearchChange}
          />
        </div>
        {modeToggle}
      </div>
      {agents.length > 1 && (
        <div
          data-testid="mobile-board-agent-filter"
          className="-mx-3 flex gap-1 overflow-x-auto px-3 [scrollbar-width:none]"
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
            {t("filter.allAgents")}
          </button>
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              aria-pressed={filterPath === agent.folderPath}
              // The pin stores the agent ID (the scope translates id→path,
              // `use-team-board-scope.ts`); the SELECTED state compares the
              // resolved path, which is what `filterPath` carries.
              onClick={() => setTeamAgentFilter(agent.id)}
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
