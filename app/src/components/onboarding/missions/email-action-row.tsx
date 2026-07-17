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
 * button (filled `bg-chip` row + the brand mark floating directly on it +
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
        "group/row flex w-full items-center gap-4 rounded-2xl bg-chip px-6 py-6 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-hover",
      )}
    >
      {/* The brand mark floats directly on the row — no recessed tile behind
          it (the dark box read as a second surface inside the card). */}
      <span className="flex size-11 shrink-0 items-center justify-center">
        {icon}
      </span>
      {loading ? (
        <>
          <span className="min-w-0 flex-1 text-base font-medium text-ink">
            {/* Resting: "Connecting". Hover: "Cancel" — the click aborts. */}
            <span className="group-hover/row:hidden">{busyLabel}</span>
            <span className="hidden group-hover/row:inline">{cancelLabel}</span>
          </span>
          <span className="relative size-5 shrink-0 text-ink-muted">
            <Loader2
              className="size-5 animate-spin transition-opacity group-hover/row:opacity-0"
              aria-hidden="true"
            />
            <X
              className="absolute inset-0 size-5 opacity-0 transition-opacity group-hover/row:opacity-100"
              aria-hidden="true"
            />
          </span>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 text-base font-medium text-ink">
            {label}
          </span>
          <ChevronRight
            className="size-5 shrink-0 text-ink-muted"
            aria-hidden="true"
          />
        </>
      )}
    </button>
  );
}
