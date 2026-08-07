/**
 * RoutineDetails — the "what is this routine" surface (PRODUCT-1208), answering
 * the two questions the row and chat don't: what does this routine actually do
 * (its instruction, verbatim), and what happened on its past runs. Pure
 * presentation for a popover/sheet body: the app fetches the runs and passes
 * `t()` labels in.
 */

import { Loader2 } from "lucide-react";
import {
  DEFAULT_DETAILS_LABELS,
  type RoutineDetailsLabels,
  type RoutineRunListLabels,
} from "./labels-details";
import { RoutineRunList } from "./routine-run-list";
import type { RoutineRun } from "./types";

export interface RoutineDetailsProps {
  /** The routine's instruction — the prompt sent to the model when it fires. */
  prompt: string;
  /** Newest-first run records; undefined while loading. */
  runs?: RoutineRun[];
  runsLoading?: boolean;
  /** BCP-47 locale for the run-time stamps. */
  locale?: string;
  labels?: Partial<RoutineDetailsLabels>;
  runListLabels?: Partial<RoutineRunListLabels>;
}

export function RoutineDetails({
  prompt,
  runs,
  runsLoading,
  locale,
  labels,
  runListLabels,
}: RoutineDetailsProps) {
  const l = { ...DEFAULT_DETAILS_LABELS, ...labels };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <section className="flex min-h-0 flex-col gap-1.5">
        <h3 className="text-sm font-medium text-ink">{l.promptTitle}</h3>
        <div className="max-h-40 overflow-y-auto rounded-lg bg-chip-subtle px-3 py-2">
          <p className="whitespace-pre-wrap text-sm text-ink">{prompt}</p>
        </div>
      </section>

      <section className="flex min-h-0 flex-col gap-0.5">
        <h3 className="text-sm font-medium text-ink">{l.runsTitle}</h3>
        {runsLoading ? (
          <p className="flex items-center gap-2 px-1 py-2 text-sm text-ink-muted">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {l.runsLoading}
          </p>
        ) : (
          <div className="min-h-0 overflow-y-auto">
            <RoutineRunList
              runs={runs ?? []}
              locale={locale}
              labels={runListLabels}
            />
          </div>
        )}
      </section>
    </div>
  );
}
