/**
 * How a list row states its depth: the leading indent and the folder row's
 * disclosure triangle. The two have to agree — a file pads past exactly the
 * chevron a folder draws, or the icon column staircases down the tree — so
 * they live together.
 */
import { cn } from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import { BASE_INDENT, DEPTH_INDENT, TRIANGLE_AREA } from "./files-list-chrome";

/**
 * The leading space a row's name cell reserves for its depth. `chevron` adds
 * the room a FOLDER's disclosure triangle occupies, so a file's tile lines up
 * with the folder glyphs at its own depth instead of 24px to their left.
 */
export function RowIndent({
  depth,
  chevron,
}: {
  depth: number;
  /** True on rows that draw no chevron of their own (files, empty rows). */
  chevron?: boolean;
}) {
  return (
    <span
      aria-hidden
      className="h-full shrink-0"
      style={{
        width:
          BASE_INDENT + depth * DEPTH_INDENT + (chevron ? TRIANGLE_AREA : 0),
      }}
    />
  );
}

/** Folder-row expand/collapse indicator (rotates a quarter turn when open). */
export function DisclosureChevron({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        "size-4 shrink-0 text-ink-muted transition-transform duration-150",
        open && "rotate-90",
        className,
      )}
    />
  );
}
