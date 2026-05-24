/**
 * RunHistory — list of past routine runs with status, time, duration, summary.
 *
 * Visual: dense one-line rows so a long history scans quickly. Surfaced runs
 * get a "View" affordance that links back to the activity board.
 */
import { cn, Button } from "@houston-ai/core";
import { ArrowUpRight, PauseCircle, Square } from "lucide-react";
import type { RoutineRun } from "./types";

export interface RunHistoryProps {
  runs: RoutineRun[];
  onViewActivity?: (activityId: string) => void;
  /** Stop an in-flight `running` run. When omitted, the stop button is not rendered. */
  onCancelRun?: (runId: string) => void;
}

const STATUS_DOT: Record<string, string> = {
  silent: "bg-gray-400",
  surfaced: "bg-foreground",
  running: "bg-blue-500 animate-pulse",
  error: "bg-red-500",
  cancelled: "bg-gray-400",
};

const STATUS_LABEL: Record<string, string> = {
  silent: "Silent",
  surfaced: "Surfaced",
  running: "Running",
  error: "Error",
  cancelled: "Cancelled",
};

function formatRunTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

function formatDuration(
  startedAt: string,
  completedAt?: string,
): string | null {
  if (!completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

export function RunHistory({
  runs,
  onViewActivity,
  onCancelRun,
}: RunHistoryProps) {
  const sorted = [...runs].sort(
    (a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No runs yet — this routine hasn't fired.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-1.5">
      {sorted.map((run) => {
        const duration = formatDuration(run.started_at, run.completed_at);
        const isSurfaced =
          run.status === "surfaced" && run.activity_id && onViewActivity;
        const isPaused = run.status === "running" && !!run.paused_until;
        // While paused, the CLI is sleeping — show an amber dot instead of
        // the blue pulse so a long-running routine reads as "waiting" not
        // "thrashing", and overwrite the summary slot with the reset hint.
        const dotClass = isPaused
          ? "bg-amber-500"
          : (STATUS_DOT[run.status] ?? "bg-gray-300");
        const statusLabel = isPaused
          ? "Paused"
          : (STATUS_LABEL[run.status] ?? run.status);
        return (
          <li
            key={run.id}
            className={cn(
              "group flex items-center gap-3 px-3 py-2.5 rounded-lg",
              "bg-background border border-black/[0.04]",
              "transition-shadow duration-150",
              "hover:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
            )}
          >
            <span
              className={cn("size-1.5 rounded-full shrink-0", dotClass)}
              aria-hidden
            />
            <span className="text-xs text-muted-foreground tabular-nums w-36 shrink-0">
              {formatRunTime(run.started_at)}
            </span>
            <span
              className={cn(
                "text-xs w-16 shrink-0",
                run.status === "error"
                  ? "text-red-500"
                  : isPaused
                    ? "text-amber-600"
                    : "text-muted-foreground",
              )}
            >
              {statusLabel}
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums w-12 shrink-0">
              {duration ?? "—"}
            </span>
            <span
              className={cn(
                "text-xs truncate flex-1 min-w-0 flex items-center gap-1",
                isPaused ? "text-amber-700" : "text-muted-foreground/80",
              )}
            >
              {isPaused && (
                <PauseCircle
                  className="size-3 shrink-0 text-amber-600"
                  aria-hidden
                />
              )}
              {isPaused
                ? `Waiting for usage limit — resumes at ${run.paused_until}`
                : (run.summary ?? "")}
            </span>
            {isSurfaced && (
              <button
                onClick={() => onViewActivity!(run.activity_id!)}
                className={cn(
                  "flex items-center gap-1 text-xs text-foreground shrink-0",
                  "hover:text-foreground/70 transition-colors",
                )}
              >
                View
                <ArrowUpRight className="size-3" />
              </button>
            )}
            {run.status === "running" && onCancelRun && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onCancelRun(run.id)}
                aria-label="Stop run"
                className="shrink-0"
              >
                <Square className="size-3" />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
