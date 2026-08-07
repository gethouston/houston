import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { type ReactNode, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HistoryLoadOptions } from "../../lib/tauri";
import { useUIStore } from "../../stores/ui";
import { MissionBoardEmptyState } from "../mission-board-empty-state";
import { useMissionSearch } from "../use-mission-search";

export interface McSearch {
  query: string;
  setQuery: (query: string) => void;
  /** The items the board renders: `items` narrowed by the query. */
  items: KanbanItem[];
  hasQuery: boolean;
  /** A transcript scan is still running behind the current query. */
  isSearchingText: boolean;
  /** What the board shows with nothing to show. `undefined` outside a search:
   *  an empty board with no query keeps its columns and their own CTA. */
  emptyState: ReactNode | undefined;
}

/**
 * The text-search half of {@link useMissionControlSource}: the query, the
 * transcript scan behind it (whose failures must reach the user as a toast, per
 * the no-silent-failures rule), and the empty state a fruitless search shows.
 */
export function useMcSearch({
  items,
  loadHistory,
  onNewMission,
}: {
  items: KanbanItem[];
  loadHistory: (
    sessionKey: string,
    opts?: HistoryLoadOptions,
  ) => Promise<FeedItem[]>;
  onNewMission: () => void;
}): McSearch {
  const { t } = useTranslation("dashboard");
  const addToast = useUIStore((s) => s.addToast);
  const [query, setQuery] = useState("");

  const onHistoryLoadError = useCallback(() => {
    addToast({
      title: t("search.historyErrorTitle"),
      description: t("search.historyErrorDescription"),
      variant: "error",
    });
  }, [addToast, t]);
  const search = useMissionSearch({
    items,
    query,
    loadHistory,
    onHistoryLoadError,
  });

  return {
    query,
    setQuery,
    items: search.items,
    hasQuery: search.hasQuery,
    isSearchingText: search.isSearchingText,
    emptyState: search.hasQuery ? (
      <MissionBoardEmptyState
        isSearch
        isSearchingText={search.isSearchingText}
        labels={{
          emptyTitle: t("empty.boardTitle"),
          emptyDescription: t("empty.boardDescription"),
          newMission: t("empty.newMission"),
          searchEmptyTitle: t("search.emptyTitle"),
          searchEmptyDescription: t("search.emptyDescription"),
          searchSearchingTitle: t("search.searchingTitle"),
          searchSearchingDescription: t("search.searchingDescription"),
          clearSearch: t("search.clearCta"),
        }}
        onNewMission={onNewMission}
        onClearSearch={() => setQuery("")}
      />
    ) : undefined,
  };
}
