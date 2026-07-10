import { cn } from "@houston-ai/core";
import { ChevronRight, Loader2 } from "lucide-react";
import type { ReviewItemData, RunStatus } from "./types";

interface ReviewItemProps {
  item: ReviewItemData;
  onClick: () => void;
}

function statusIndicator(status: RunStatus) {
  switch (status) {
    case "needs_you":
      return (
        <span className="relative flex size-3 shrink-0">
          <span className="absolute inline-flex size-full rounded-full bg-action" />
        </span>
      );
    case "running":
      return (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-muted" />
      );
    case "done":
    case "approved":
      return (
        <span className="flex size-2.5 shrink-0 rounded-full border-[1.5px] border-ink-muted/40" />
      );
    case "error":
    case "failed":
      return (
        <span className="flex size-2.5 shrink-0 text-danger font-bold text-xs leading-none">
          &times;
        </span>
      );
    default:
      return (
        <span className="flex size-2.5 shrink-0 rounded-full border-[1.5px] border-ink-muted/30" />
      );
  }
}

function statusLabel(status: RunStatus): string {
  switch (status) {
    case "needs_you":
      return "Ready for review";
    case "running":
      return "Running...";
    case "done":
    case "approved":
      return "Approved";
    case "completed":
      return "Completed";
    case "error":
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function ReviewItem({ item, onClick }: ReviewItemProps) {
  const isUnreviewed = item.status === "needs_you";
  const isRunning = item.status === "running";
  const isFailed = item.status === "error" || item.status === "failed";

  const displaySubtitle =
    item.title === item.subtitle ? statusLabel(item.status) : item.subtitle;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center gap-3 px-4 py-3 transition-colors duration-200",
        "hover:bg-hover/30",
      )}
    >
      {/* Status indicator */}
      <div className="flex items-center justify-center w-4">
        {statusIndicator(item.status)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm truncate",
            isUnreviewed ? "font-semibold text-ink" : "font-normal text-ink/70",
            isFailed && "text-danger",
          )}
        >
          {item.title}
        </p>
        <p className="text-xs text-ink-muted truncate mt-0.5">
          {displaySubtitle}
          {isRunning && item.title !== item.subtitle && (
            <span className="animate-pulse"> &middot; Running...</span>
          )}
        </p>
      </div>

      {/* Timestamp */}
      <span className="text-xs text-ink-muted/50 shrink-0">
        {relativeTime(item.createdAt)}
      </span>

      {/* Right chevron for actionable items */}
      {isUnreviewed && (
        <ChevronRight className="size-4 shrink-0 text-ink-muted" />
      )}
    </button>
  );
}
