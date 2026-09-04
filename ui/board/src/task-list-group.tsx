import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export interface TaskListGroupLabels {
  /** Accessible name for the count, e.g. `(n) => \`${n} tasks\``. Without one
   *  the bare number is read, which is enough beside a named heading. */
  count?: (count: number) => string;
}

export interface TaskListGroupProps {
  heading: string;
  count?: number;
  /** A collapsible group's heading is a button; its rows render only when
   *  `open`. The archive is the one group that opens closed. */
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
  dataAttrs?: Record<string, string>;
  labels?: TaskListGroupLabels;
}

/**
 * One named band of {@link TaskRow}s: a muted heading with its count flush
 * right, and — for the archive — a chevron that folds the rows away.
 *
 * The heading is deliberately quieter than the rows it names: on a phone the
 * tasks are the content and the section words are structure, so the band reads
 * as a label rather than competing with the titles under it.
 */
export function TaskListGroup({
  heading,
  count,
  collapsible = false,
  open = false,
  onToggle,
  children,
  dataAttrs,
  labels,
}: TaskListGroupProps) {
  const spokenCount = count === undefined ? undefined : labels?.count?.(count);
  const countNode =
    count === undefined ? null : (
      <span className="shrink-0 text-xs text-ink-muted tabular-nums">
        {/* The number is the visible form; a caller that supplies words gets
            them read INSTEAD, so a screen reader never hears a bare digit. */}
        {spokenCount ? <span className="sr-only">{spokenCount}</span> : null}
        <span aria-hidden={spokenCount !== undefined}>{count}</span>
      </span>
    );
  const headingText = (
    <span className="min-w-0 truncate text-sm font-medium text-ink-muted">
      {heading}
    </span>
  );

  return (
    <section>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          {...dataAttrs}
          className="flex min-h-11 w-full items-center gap-2 px-4 pt-4 pb-1 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {open ? (
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-ink-muted"
            />
          ) : (
            <ChevronRight
              aria-hidden
              className="size-4 shrink-0 text-ink-muted"
            />
          )}
          {headingText}
          <span className="flex-1" />
          {countNode}
        </button>
      ) : (
        <h2 {...dataAttrs} className="flex items-center gap-2 px-4 pt-4 pb-1">
          {headingText}
          <span className="flex-1" />
          {countNode}
        </h2>
      )}
      {!collapsible || open ? children : null}
    </section>
  );
}
