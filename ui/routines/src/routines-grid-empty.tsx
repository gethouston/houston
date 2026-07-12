/**
 * RoutinesGridEmpty — the Routines list's first-run empty state: a headline, a
 * three-step "how it works" walkthrough so a first-time visitor isn't left to
 * guess, and the "New routine" CTA. Extracted from RoutinesGrid to keep that
 * file under the size cap; it renders only when there are no routines, no draft
 * chats, and no local new-routine editor open.
 */
import { EmptyDescription, EmptyHeader, EmptyTitle } from "@houston-ai/core";
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
      <div className="mx-auto max-w-lg flex flex-col items-center gap-6 text-center pt-16 px-6 pb-12">
        <EmptyHeader>
          <EmptyTitle>{l.emptyTitle}</EmptyTitle>
          <EmptyDescription>{l.emptyDescription}</EmptyDescription>
        </EmptyHeader>

        {/* Guided walkthrough: what creating a routine actually involves. */}
        <div className="w-full text-left">
          <p className="text-xs font-medium text-ink-muted mb-2 px-1">
            {l.emptyStepsTitle}
          </p>
          <ol className="rounded-xl bg-chip divide-y divide-line/60 overflow-hidden">
            {l.emptySteps.map((step, i) => (
              <li
                key={step.title}
                className="flex items-start gap-3 px-4 py-3.5"
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-input text-[11px] font-medium text-ink mt-0.5">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{step.title}</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {hasCreate && (
          <NewRoutineMenu
            onCreateWithAi={onCreateWithAi ?? (() => {})}
            onCreateManually={onCreateManually ?? (() => {})}
            labels={labels}
            aiIcon={aiIcon}
          />
        )}
      </div>
    </div>
  );
}
