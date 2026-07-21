/**
 * Segmented grid/list toggle for the files header: a soft chip container with
 * one pressed segment (no border box, per the flat header language).
 */
import { cn } from "@houston-ai/core";
import { LayoutGrid, List } from "lucide-react";
import type { FilesViewMode } from "./types";

export function ViewToggle({
  view,
  onViewChange,
  viewGridLabel,
  viewListLabel,
}: {
  view: FilesViewMode;
  onViewChange: (view: FilesViewMode) => void;
  viewGridLabel: string;
  viewListLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-chip-subtle p-0.5">
      <ViewToggleButton
        active={view === "list"}
        label={viewListLabel}
        onClick={() => onViewChange("list")}
      >
        <List aria-hidden className="size-3.5" />
      </ViewToggleButton>
      <ViewToggleButton
        active={view === "grid"}
        label={viewGridLabel}
        onClick={() => onViewChange("grid")}
      >
        <LayoutGrid aria-hidden className="size-3.5" />
      </ViewToggleButton>
    </div>
  );
}

function ViewToggleButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md p-1 transition-colors",
        active
          ? "bg-chip-solid text-ink"
          : "text-ink-muted hover:bg-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
