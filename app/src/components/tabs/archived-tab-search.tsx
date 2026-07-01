import { KanbanListRail } from "@houston-ai/board";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Archive } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MissionSearchInput } from "../mission-search-input";

interface ArchivedSearchBarProps {
  value: string;
  isSearchingText: boolean;
  visible: boolean;
  onChange: (value: string) => void;
}

export function ArchivedSearchBar({
  value,
  isSearchingText,
  visible,
  onChange,
}: ArchivedSearchBarProps) {
  const { t } = useTranslation("board");
  if (!visible) return null;

  return (
    <div className="px-8 pt-4 pb-2">
      <KanbanListRail align="left">
        <MissionSearchInput
          value={value}
          isSearchingText={isSearchingText}
          labels={{
            placeholder: t("archived.searchPlaceholder"),
            clear: t("search.clear"),
            searchingText: t("search.searchingText"),
          }}
          className="relative w-full max-w-md"
          onChange={onChange}
        />
      </KanbanListRail>
    </div>
  );
}

interface ArchivedEmptyStateProps {
  hasQuery: boolean;
  isSearchingText: boolean;
}

export function ArchivedEmptyState({
  hasQuery,
  isSearchingText,
}: ArchivedEmptyStateProps) {
  const { t } = useTranslation("board");

  return (
    <Empty className="border-0">
      <EmptyHeader>
        <Archive className="size-8 text-muted-foreground" strokeWidth={1.5} />
        <EmptyTitle>
          {hasQuery
            ? isSearchingText
              ? t("search.searchingTitle")
              : t("search.emptyTitle")
            : t("archived.emptyTitle")}
        </EmptyTitle>
        <EmptyDescription>
          {hasQuery
            ? isSearchingText
              ? t("search.searchingDescription")
              : t("search.emptyDescription")
            : t("archived.emptyDescription")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
