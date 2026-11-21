import { cn } from "@houston-ai/core";
import { MISSION_TAG_BASE_CLASSES } from "./mission-status-tag";

export function MissionOriginTag({ label }: { label: string }) {
  return (
    <span
      data-testid="agent-mission-origin"
      className={cn(MISSION_TAG_BASE_CLASSES, "min-w-0 bg-chip text-chip-text")}
    >
      <span className="truncate leading-4">{label}</span>
    </span>
  );
}
