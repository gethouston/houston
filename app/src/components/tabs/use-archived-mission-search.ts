import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";

import { useUIStore } from "../../stores/ui";
import { tauriChat } from "../../lib/tauri";
import { useMissionSearch } from "../use-mission-search";

export function useArchivedMissionSearch(
  agentPath: string,
  items: KanbanItem[],
) {
  const { t } = useTranslation("board");
  const query = useUIStore(
    (s) => s.agentArchivedSearchQueries[agentPath] ?? "",
  );
  const isLoading = useUIStore(
    (s) => s.agentArchivedSearchLoading[agentPath] ?? false,
  );
  const setQuery = useUIStore((s) => s.setAgentArchivedSearchQuery);
  const setLoading = useUIStore((s) => s.setAgentArchivedSearchLoading);
  const addToast = useUIStore((s) => s.addToast);

  const loadHistory = useCallback(
    async (sessionKey: string) =>
      (await tauriChat.loadHistory(agentPath, sessionKey)) as FeedItem[],
    [agentPath],
  );
  const handleHistoryLoadError = useCallback(() => {
    addToast({
      title: t("search.historyErrorTitle"),
      description: t("search.historyErrorDescription"),
      variant: "error",
    });
  }, [addToast, t]);
  const missionSearch = useMissionSearch({
    items,
    query,
    loadHistory,
    onHistoryLoadError: handleHistoryLoadError,
  });

  useEffect(() => {
    setLoading(agentPath, missionSearch.isSearchingText);
    return () => setLoading(agentPath, false);
  }, [agentPath, missionSearch.isSearchingText, setLoading]);

  return {
    loadHistory,
    missionSearch,
    query,
    isLoading,
    setQuery: (value: string) => setQuery(agentPath, value),
  };
}
