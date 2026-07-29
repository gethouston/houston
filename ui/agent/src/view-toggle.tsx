/**
 * Grid/list tabs for the Files toolbar: two bare 36px glyph buttons, the
 * active one filled. No ring around them — on a borderless page the outline
 * was the loudest thing in a row of quiet glyphs, and the filled segment
 * already says which view you are in. Both glyphs stay visible in both states,
 * so the control also says which view the other one would give you.
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
    <div className="flex h-9 shrink-0 items-center gap-0.5">
      <ViewToggleButton
        active={view === "list"}
        label={viewListLabel}
        onClick={() => onViewChange("list")}
      >
        <List aria-hidden className="size-4" />
      </ViewToggleButton>
      <ViewToggleButton
        active={view === "grid"}
        label={viewGridLabel}
        onClick={() => onViewChange("grid")}
      >
        <LayoutGrid aria-hidden className="size-4" />
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
        "flex size-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        // chip-solid-hover, not chip-solid: on both canvases the softer fill
        // sat within a hair of the surface and the "pressed" segment read as
        // unpressed. This is the step the eye actually catches.
        active
          ? "bg-chip-solid-hover text-ink"
          : "text-ink-muted hover:bg-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
