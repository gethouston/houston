import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import { HoustonLogo } from "./shell/experience-card";

interface MissionBoardEmptyLabels {
  emptyTitle: string;
  emptyDescription: string;
  newMission: string;
  searchEmptyTitle: string;
  searchEmptyDescription: string;
  searchSearchingTitle: string;
  searchSearchingDescription: string;
  clearSearch: string;
}

interface MissionBoardEmptyStateProps {
  isSearch: boolean;
  isSearchingText: boolean;
  labels: MissionBoardEmptyLabels;
  onNewMission: () => void;
  onClearSearch: () => void;
}

export function MissionBoardEmptyState({
  isSearch,
  isSearchingText,
  labels,
  onNewMission,
  onClearSearch,
}: MissionBoardEmptyStateProps) {
  if (isSearch) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>
            {isSearchingText
              ? labels.searchSearchingTitle
              : labels.searchEmptyTitle}
          </EmptyTitle>
          <EmptyDescription>
            {isSearchingText
              ? labels.searchSearchingDescription
              : labels.searchEmptyDescription}
          </EmptyDescription>
        </EmptyHeader>
        {isSearchingText ? (
          <div className="mt-4 flex h-9 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-ink-muted" />
          </div>
        ) : (
          <Button
            className="mt-4 rounded-full"
            size="sm"
            variant="outline"
            onClick={onClearSearch}
          >
            {labels.clearSearch}
          </Button>
        )}
      </Empty>
    );
  }

  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyTitle>{labels.emptyTitle}</EmptyTitle>
        <EmptyDescription>{labels.emptyDescription}</EmptyDescription>
      </EmptyHeader>
      <Button
        className="mt-4 rounded-full gap-1.5"
        size="sm"
        onClick={onNewMission}
      >
        <HoustonLogo size={16} />
        {labels.newMission}
      </Button>
    </Empty>
  );
}
