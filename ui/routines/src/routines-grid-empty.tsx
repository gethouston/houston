/**
 * RoutinesGridEmpty — the Automations list's first-run empty state, on the
 * catalog grammar's pure shape: a headline, one explaining paragraph, and the
 * single filled "New automation" CTA. (The old three-step walkthrough is gone
 * with the grammar convergence — the editor itself now teaches the wake
 * choice.) Renders only when there are no automations, no draft chats, and no
 * local new-automation editor open.
 */
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import type { ReactNode } from "react";
import { DEFAULT_GRID_LABELS, type RoutinesGridLabels } from "./labels";
import { NewRoutineMenu } from "./new-routine-menu";

export interface RoutinesGridEmptyProps {
  labels?: RoutinesGridLabels;
  /** Icon for the "With AI" entry — app supplies the brand mark. */
  aiIcon?: ReactNode;
  onCreateWithAi?: () => void;
  onCreateManually?: () => void;
}

export function RoutinesGridEmpty({
  labels = DEFAULT_GRID_LABELS,
  aiIcon,
  onCreateWithAi,
  onCreateManually,
}: RoutinesGridEmptyProps) {
  const l = labels;
  const hasCreate = onCreateWithAi || onCreateManually;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-transparent">
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyTitle className="text-lg">{l.emptyTitle}</EmptyTitle>
          <EmptyDescription>{l.emptyDescription}</EmptyDescription>
        </EmptyHeader>
        {hasCreate && (
          <NewRoutineMenu
            onCreateWithAi={onCreateWithAi ?? (() => {})}
            onCreateManually={onCreateManually ?? (() => {})}
            labels={labels}
            aiIcon={aiIcon}
          />
        )}
      </Empty>
    </div>
  );
}
