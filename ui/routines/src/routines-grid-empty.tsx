import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import type { ReactNode } from "react";
import { DEFAULT_GRID_LABELS, type RoutinesGridLabels } from "./labels";

export interface RoutinesGridEmptyProps {
  labels?: RoutinesGridLabels;
  action?: ReactNode;
}

export function RoutinesGridEmpty({
  labels = DEFAULT_GRID_LABELS,
  action,
}: RoutinesGridEmptyProps) {
  const l = labels;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyTitle className="text-lg">{l.emptyTitle}</EmptyTitle>
          <EmptyDescription>{l.emptyDescription}</EmptyDescription>
        </EmptyHeader>
        {action ? <EmptyContent>{action}</EmptyContent> : null}
      </Empty>
    </div>
  );
}
