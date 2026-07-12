import { cn } from "@houston-ai/core";
import {
  Bot,
  Check,
  Clock,
  Globe,
  Heart,
  MessageSquare,
  Zap,
} from "lucide-react";
import type { EventEntry, EventType } from "./types";

export interface EventItemProps {
  event: EventEntry;
  onClick?: (event: EventEntry) => void;
}

const iconMap: Record<
  EventType,
  React.ComponentType<{ className?: string }>
> = {
  message: MessageSquare,
  heartbeat: Heart,
  cron: Clock,
  hook: Zap,
  webhook: Globe,
  agent_message: Bot,
};

function statusIndicator(status: EventEntry["status"]) {
  switch (status) {
    case "pending":
      return (
        <span className="flex size-2 shrink-0 rounded-full bg-ink-muted/40" />
      );
    case "processing":
      return (
        <span className="flex size-2 shrink-0 rounded-full bg-action tool-active-dot" />
      );
    case "completed":
      return <Check className="size-3 shrink-0 text-green-600" />;
    case "suppressed":
      return (
        <span className="flex size-2 shrink-0 rounded-full bg-ink-muted/30" />
      );
    case "error":
      return <span className="flex size-2 shrink-0 rounded-full bg-danger" />;
    default:
      return (
        <span className="flex size-2 shrink-0 rounded-full bg-ink-muted/30" />
      );
  }
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);

  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function EventItem({ event, onClick }: EventItemProps) {
  const Icon = iconMap[event.type];
  const isSuppressed = event.status === "suppressed";
  const isSuppressedHeartbeat = isSuppressed && event.type === "heartbeat";

  return (
    <button
      type="button"
      onClick={() => onClick?.(event)}
      className={cn(
        "w-full text-left flex items-center gap-3 px-3 py-2 transition-colors duration-150",
        "hover:bg-hover/50",
        isSuppressedHeartbeat && "opacity-50",
      )}
    >
      {/* Type icon */}
      <div className="flex items-center justify-center w-4 shrink-0">
        <Icon className="size-4 text-ink-muted" />
      </div>

      {/* Summary + source */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm truncate text-ink",
            isSuppressed && "line-through text-ink-muted",
          )}
        >
          {event.summary}
        </p>
        <p className="text-[11px] text-ink-muted truncate">
          {event.source.channel}
          {event.source.identifier && ` ${event.source.identifier}`}
        </p>
      </div>

      {/* Timestamp + status */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-ink-muted/60">
          {relativeTime(event.createdAt)}
        </span>
        {statusIndicator(event.status)}
      </div>
    </button>
  );
}
