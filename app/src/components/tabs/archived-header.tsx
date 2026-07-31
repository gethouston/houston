import { KanbanListRail } from "@houston-ai/board";
import { useTranslation } from "react-i18next";
import { BoardBackButton } from "../board/board-back-button";
import { MissionSearchInput } from "../mission-search-input";

interface ArchivedHeaderProps {
  search: string;
  isSearchingText: boolean;
  /** Whether there is anything to search yet (no list, no search field). */
  searchable: boolean;
  onSearchChange: (value: string) => void;
  onBack: () => void;
}

/**
 * Header of an agent's archived missions: the way back to the active board,
 * the mode's name, and the archive search. It mirrors the Mission Control bar
 * so both archived surfaces read the same, and it renders unconditionally,
 * including on an empty archive, so the exit is never missing (HOU-1043).
 */
export function ArchivedHeader({
  search,
  isSearchingText,
  searchable,
  onSearchChange,
  onBack,
}: ArchivedHeaderProps) {
  const { t } = useTranslation(["board", "dashboard"]);

  return (
    <div className="shrink-0 px-8 pt-4 pb-2">
      <KanbanListRail align="left">
        <div className="flex items-center gap-3">
          <BoardBackButton
            label={t("dashboard:archived.back")}
            onClick={onBack}
          />
          {/* h2: the tab bar above already owns the page's h1 (the agent's
              name). Truncates before the back button does, so the way home
              survives a narrow window. */}
          <h2 className="min-w-0 truncate text-xl font-semibold text-ink">
            {t("dashboard:archived.title")}
          </h2>
          {searchable && (
            <div className="flex min-w-0 flex-1 items-center justify-end">
              <MissionSearchInput
                value={search}
                isSearchingText={isSearchingText}
                labels={{
                  placeholder: t("board:archived.searchPlaceholder"),
                  clear: t("board:search.clear"),
                  searchingText: t("board:search.searchingText"),
                }}
                className="relative min-w-0 flex-1 max-w-[320px]"
                onChange={onSearchChange}
              />
            </div>
          )}
        </div>
      </KanbanListRail>
    </div>
  );
}
