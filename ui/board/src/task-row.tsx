import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import {
  type TaskRowLabels,
  type TaskRowStatus,
  taskRowGlyph,
} from "./task-row-styles";

export interface TaskRowProps {
  status: TaskRowStatus;
  title: string;
  /** A second, muted line — the task's own description. Omitted when empty:
   *  a one-line row is the honest shape, never a blank second line. */
  preview?: string;
  /** Right-hand slot, typically the movement's relative time. */
  trailing?: ReactNode;
  onSelect: () => void;
  dataAttrs?: Record<string, string>;
  labels?: TaskRowLabels;
}

/**
 * ONE task, as a phone row: a status glyph, the title over an optional
 * preview, and a trailing slot. The shared shape behind every task list on the
 * phone (an agent's list, a team's list), so a task can never look like two
 * different things depending on which screen found it.
 *
 * The whole row is a single button — a phone row has no room for a second
 * target, and nothing here waits for a hover. The hairline is the row's own
 * bottom border and drops on the last row of a stack, so a group ends on the
 * screen surface rather than on a line pointing at nothing.
 */
export function TaskRow({
  status,
  title,
  preview,
  trailing,
  onSelect,
  dataAttrs,
  labels,
}: TaskRowProps) {
  const { Icon, tone, label, spin } = taskRowGlyph(status, labels);
  return (
    <button
      type="button"
      onClick={onSelect}
      {...dataAttrs}
      className="flex min-h-12 w-full items-center gap-3 border-b border-line px-4 py-2 text-left transition-colors last:border-0 hover:bg-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Icon
        role="img"
        aria-label={label}
        className={cn(
          "size-5 shrink-0",
          tone,
          spin && "motion-safe:animate-spin",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base text-ink">{title}</span>
        {preview ? (
          <span className="mt-0.5 block truncate text-sm text-ink-muted">
            {preview}
          </span>
        ) : null}
      </span>
      {trailing ? (
        <span className="shrink-0 text-xs text-ink-muted tabular-nums">
          {trailing}
        </span>
      ) : null}
    </button>
  );
}
