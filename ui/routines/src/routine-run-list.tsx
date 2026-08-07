/**
 * RoutineRunList — one routine's recorded execution history (PRODUCT-1208):
 * each run as a quiet row with a status glyph + plain-language outcome, its
 * start stamp and elapsed time, and the summary the run left behind. Read-only
 * by design: reviewing what happened is this list's whole job — acting on a
 * run (stop, open the chat) stays on the routine row and the board.
 */

import { cn } from "@houston-ai/core";
import { Ban, Check, CircleAlert, Loader2 } from "lucide-react";
import {
  DEFAULT_RUN_LIST_LABELS,
  type RoutineRunListLabels,
} from "./labels-details";
import { formatRunDuration, formatRunStart } from "./run-history";
import type { RoutineRun, RunStatus } from "./types";

export interface RoutineRunListProps {
  /** Newest-first run records (the store's native order). */
  runs: RoutineRun[];
  /** BCP-47 locale for the start-time stamps. */
  locale?: string;
  labels?: Partial<RoutineRunListLabels>;
}

/** Status → glyph + tone. Color is semantic only; the label carries the meaning. */
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

export function RoutineRunList({ runs, locale, labels }: RoutineRunListProps) {
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
        return (
          <li
            key={run.id}
            className="flex gap-2.5 border-t border-line/50 py-2 first:border-t-0"
          >
            <Icon
              aria-hidden
              className={cn("mt-0.5 size-4 shrink-0", className)}
              strokeWidth={1.75}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {statusLabels[run.status]}
                </span>
                <span className="shrink-0 text-xs text-ink-muted tabular-nums">
                  {formatRunStart(run.started_at, locale)}
                  {duration && <> · {duration}</>}
                </span>
              </div>
              {run.summary && (
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">
                  {run.summary}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
