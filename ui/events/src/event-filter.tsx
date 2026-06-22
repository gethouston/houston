import { cn, Badge } from "@houston-ai/core";
import type { EventType } from "./types";
import { EVENT_TYPE_LABELS } from "./types";

export interface EventFilterProps {
  value: EventType | null;
  onChange: (type: EventType | null) => void;
  counts?: Partial<Record<EventType, number>>;
}

const EVENT_TYPES: EventType[] = [
  "message",
  "heartbeat",
  "cron",
  "hook",
  "webhook",
  "agent_message",
];

export function EventFilter({ value, onChange, counts }: EventFilterProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto">
      <button
        onClick={() => onChange(null)}
        className={cn(
          "shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-150",
          value === null
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-muted-foreground hover:bg-accent",
        )}
      >
        All
      </button>

      {EVENT_TYPES.map((type) => {
        const count = counts?.[type];
        const isActive = value === type;

        return (
          <button
            key={type}
            onClick={() => onChange(isActive ? null : type)}
            className={cn(
              "shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-150",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-accent",
            )}
          >
            {EVENT_TYPE_LABELS[type]}
            {count !== undefined && count > 0 && (
              <Badge
                variant={isActive ? "secondary" : "outline"}
                className="ml-0.5 px-1.5 py-0 text-[10px] leading-4 h-4"
              >
                {count}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
