import { cn } from "@houston-ai/core";
import { ChevronRight, Loader2, X } from "lucide-react";
import type { ReactNode } from "react";

interface EmailActionRowProps {
  /** Leading brand mark, rendered inside a recessed media tile. */
  icon: ReactNode;
  label: string;
  /** Copy shown in place of the label while this row's connect is in flight. */
  busyLabel: string;
  /** Copy shown on hover while in flight — the row is the cancel control then. */
  cancelLabel: string;
  /** This row's OAuth connect is in flight: it becomes the cancel control. */
  loading: boolean;
  /** Another row's connect is in flight: this row is dimmed and inert. */
  disabled: boolean;
  onClick: () => void;
}

/**
 * A one-click brand action row for the connect-email step. Reads as a real
 * button (filled `bg-secondary` row + a recessed `bg-background` media tile +
 * label + a trailing "go" chevron), rhyming with the AI step's provider rows.
 *
 * Three states:
 *  - idle: brand icon + label + chevron; click starts the OAuth connect.
 *  - in-flight (`loading`): stays ENABLED and becomes the CANCEL control,
 *    mirroring the AI step's Connect pill — the label + spinner read
 *    "Connecting" at rest and flip to an X + cancel copy on hover; click aborts
 *    the wait so the user can immediately pick a different provider.
 *  - disabled: another row's connect is in flight; dimmed and inert.
 */
export function EmailActionRow({
  icon,
  label,
  busyLabel,
  cancelLabel,
  loading,
  disabled,
  onClick,
}: EmailActionRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      // While in flight the row IS the cancel control, so name it that for
      // screen readers (the visible label reads "Connecting").
      aria-label={loading ? cancelLabel : undefined}
      onClick={onClick}
      className={cn(
        "group/row flex w-full items-center gap-3 rounded-xl bg-secondary px-4 py-3 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-accent",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-background">
        {icon}
      </span>
      {loading ? (
        <>
          <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
            {/* Resting: "Connecting". Hover: "Cancel" — the click aborts. */}
            <span className="group-hover/row:hidden">{busyLabel}</span>
            <span className="hidden group-hover/row:inline">{cancelLabel}</span>
          </span>
          <span className="relative size-4 shrink-0 text-muted-foreground">
            <Loader2
              className="size-4 animate-spin transition-opacity group-hover/row:opacity-0"
              aria-hidden="true"
            />
            <X
              className="absolute inset-0 size-4 opacity-0 transition-opacity group-hover/row:opacity-100"
              aria-hidden="true"
            />
          </span>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
            {label}
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </>
      )}
    </button>
  );
}
