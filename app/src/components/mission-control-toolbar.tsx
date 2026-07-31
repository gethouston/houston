import { useTranslation } from "react-i18next";
import { BoardBackButton } from "./board/board-back-button";
import { MissionSearchInput } from "./mission-search-input";
import {
  MissionToolbarActions,
  type MissionToolbarActionsProps,
} from "./mission-toolbar-actions";

/**
 * The Mission Control bar: an optional back arrow, the mode's title, an
 * optional search field, and the {@link MissionToolbarActions} cluster. Every
 * Mission Control mode (active board, Archived, Mentions) renders this same
 * bar and simply omits the callbacks it has nothing to do with.
 */
interface MissionControlToolbarProps extends MissionToolbarActionsProps {
  search?: string;
  isSearchingText?: boolean;
  /** When set, renders the text-search field. Omitted by the Mentions inbox,
   *  which is a short chronological list with nothing to search. */
  onSearchChange?: (value: string) => void;
  /** When set, renders the labelled back button on the left (used by the
   *  Archived and Mentions views to return to the active board). */
  onBack?: () => void;
  /** Whether the Archived view is showing -- picks the title line. */
  archivedActive?: boolean;
}

export function MissionControlToolbar(props: MissionControlToolbarProps) {
  const { t } = useTranslation("dashboard");
  const {
    search = "",
    isSearchingText = false,
    onSearchChange,
    onBack,
    archivedActive = false,
    mentionsActive = false,
  } = props;

  return (
    <div className="shrink-0 px-5 pt-4">
      <div className="mb-3 flex items-center gap-3">
        {onBack && (
          <BoardBackButton label={t("archived.back")} onClick={onBack} />
        )}
        {/* Truncates rather than holding its width: on a narrow window the way
            HOME must survive, so the title gives up space before the back
            button does. */}
        <h1 className="min-w-0 truncate text-xl font-semibold text-ink">
          {mentionsActive
            ? t("mentions.title")
            : archivedActive
              ? t("archived.title")
              : t("title")}
        </h1>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          {onSearchChange && (
            <MissionSearchInput
              value={search}
              isSearchingText={isSearchingText}
              labels={{
                placeholder: t("search.placeholder"),
                placeholderShort: t("search.placeholderShort"),
                clear: t("search.clear"),
                searchingText: t("search.searchingText"),
              }}
              className="relative min-w-0 flex-1 max-w-[320px]"
              onChange={onSearchChange}
            />
          )}
          <MissionToolbarActions {...props} />
        </div>
      </div>
    </div>
  );
}
