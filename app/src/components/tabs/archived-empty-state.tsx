import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Archive } from "lucide-react";
import { useTranslation } from "react-i18next";

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
        <Archive className="size-8 text-ink-muted" strokeWidth={1.5} />
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
