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
  items: KanbanItem[];
  hasQuery: boolean;
  isSearchingText: boolean;
  emptyState: ReactNode | undefined;
}

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
