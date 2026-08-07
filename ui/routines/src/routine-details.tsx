/**
 * RoutineDetails — the body of a routine's own screen (PRODUCT-1208): what the
 * routine does (its instruction, verbatim), when it runs, the model it runs
 * on, and its execution history. Pure presentation: the app supplies the
 * humanized schedule, the model row, the runs, and `t()` labels — and handles
 * a run click by opening that run's chat.
 */

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
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
  /** Humanized wake summary: the cron ("Runs every day at 8:00 AM") or the
   *  trigger's plain-language event. Omit to hide the section. */
  scheduleSummary?: string;
  /** Optional "next run" line under the schedule summary (cron routines). */
  nextRunText?: string;
  /** App-injected model row (the pin selector). Omit to hide the section. */
  modelSlot?: ReactNode;
  /** Newest-first run records; undefined while loading. */
  runs?: RoutineRun[];
  runsLoading?: boolean;
  /** Opens a run's chat (its result). Omit for a read-only history. */
  onOpenRun?: (run: RoutineRun) => void;
  /** BCP-47 locale for the run-time stamps. */
  locale?: string;
  labels?: Partial<RoutineDetailsLabels>;
  runListLabels?: Partial<RoutineRunListLabels>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col gap-1.5">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function RoutineDetails({
  prompt,
  scheduleSummary,
  nextRunText,
  modelSlot,
  runs,
  runsLoading,
  onOpenRun,
  locale,
  labels,
  runListLabels,
}: RoutineDetailsProps) {
  const l = { ...DEFAULT_DETAILS_LABELS, ...labels };

  return (
    <div className="flex min-h-0 flex-col gap-5">
      <Section title={l.promptTitle}>
        <div className="rounded-lg bg-chip-subtle px-3 py-2">
          <p className="whitespace-pre-wrap text-sm text-ink">{prompt}</p>
        </div>
      </Section>

      {scheduleSummary && (
        <Section title={l.scheduleTitle}>
          <p className="text-sm text-ink">{scheduleSummary}</p>
          {nextRunText && (
            <p className="text-xs text-ink-muted">{nextRunText}</p>
          )}
        </Section>
      )}

      {modelSlot && <Section title={l.modelTitle}>{modelSlot}</Section>}

      <Section title={l.runsTitle}>
        {runsLoading ? (
          <p className="flex items-center gap-2 px-1 py-2 text-sm text-ink-muted">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {l.runsLoading}
          </p>
        ) : (
          <RoutineRunList
            runs={runs ?? []}
            onOpenRun={onOpenRun}
            locale={locale}
            labels={runListLabels}
          />
        )}
      </Section>
    </div>
  );
}
