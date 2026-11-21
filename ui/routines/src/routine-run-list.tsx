import { cn } from "@houston-ai/core";
import { Ban, Check, ChevronRight, CircleAlert, Loader2 } from "lucide-react";
import {
  DEFAULT_RUN_LIST_LABELS,
  type RoutineRunListLabels,
} from "./labels-details";
import { formatRunDuration, formatRunStart } from "./run-history";
import type { RoutineRun, RunStatus } from "./types";

export interface RoutineRunListProps {
  runs: RoutineRun[];
  onOpenRun?: (run: RoutineRun) => void;
  locale?: string;
  summaryFor?: (run: RoutineRun) => string | undefined;
  labels?: Partial<RoutineRunListLabels>;
}

const STATUS_GLYPH: Record<
  RunStatus,
  { Icon: typeof Check; className: string }
> = {
  running: { Icon: Loader2, className: "animate-spin text-ink-muted" },
  silent: { Icon: Check, className: "text-ink-muted" },
  surfaced: { Icon: Check, className: "text-success" },
  error: { Icon: CircleAlert, className: "text-danger" },
  cancelled: { Icon: Ban, className: "text-ink-muted" },
};

export function RoutineRunList({
  runs,
  onOpenRun,
  locale,
  summaryFor,
  labels,
}: RoutineRunListProps) {
  const l = { ...DEFAULT_RUN_LIST_LABELS, ...labels };
  const statusLabels = { ...DEFAULT_RUN_LIST_LABELS.status, ...labels?.status };

  if (runs.length === 0) {
    return <p className="px-1 py-2 text-sm text-ink-muted">{l.empty}</p>;
  }

  return (
    <ul className="flex flex-col">
      {runs.map((run) => {
        const { Icon, className } = STATUS_GLYPH[run.status];
        const duration = formatRunDuration(run);
        const started = formatRunStart(run.started_at, locale);
        const summary = summaryFor?.(run) ?? run.summary;
        const body = (
          <>
            <Icon
              aria-hidden
              className={cn("mt-0.5 size-4 shrink-0", className)}
              strokeWidth={1.75}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-left text-sm text-ink">
                  {statusLabels[run.status]}
                </span>
                <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                  {started}
                  {duration && <> · {duration}</>}
                </span>
              </span>
              {summary && (
                <span className="mt-0.5 line-clamp-2 text-left text-xs text-ink-muted">
                  {summary}
                </span>
              )}
            </span>
          </>
        );
        return (
          <li key={run.id} className="border-t border-line/50 first:border-t-0">
            {onOpenRun ? (
              <button
                type="button"
                onClick={() => onOpenRun(run)}
                aria-label={`${statusLabels[run.status]} · ${started} · ${l.openRun}`}
                className="flex w-full gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-hover outline-none focus-visible:ring-1 focus-visible:ring-focus"
              >
                {body}
                <ChevronRight
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-ink-muted opacity-60"
                  strokeWidth={1.75}
                />
              </button>
            ) : (
              <div className="flex gap-2.5 px-2 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
