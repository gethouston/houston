"use client";

import { Plus } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../utils";
import { Spinner } from "./spinner";

/**
 * The flat catalog row, split into TWO targets so a row can both open its
 * detail surface and carry an install action without nesting buttons: the
 * row body (icon + title + description — the whole width is the "open" hit
 * target) and an optional interactive `action` sibling at the right edge
 * (typically {@link CatalogAddButton}). The `hover` fill paints the WHOLE row
 * from either target, so the two buttons still read as one row.
 */

export interface CatalogRowProps
  extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  /** Leading art (~40px): a brand logo, letter avatar, or glyph tile. */
  icon: ReactNode;
  title: string;
  /** One muted line, truncated. */
  description?: string;
  /** Quiet NON-interactive trailing inside the row body (a lock, a badge). */
  trailing?: ReactNode;
  /** Interactive right-edge sibling (its own button — never nested). */
  action?: ReactNode;
}

/** One flat catalog row — the reference's GitHub-row look: transparent at
 *  rest, the `hover` fill sweeping the full row. The row body is the button
 *  (its accessible name is its text content); `onClick` opens the item. */
export function CatalogRow({
  icon,
  title,
  description,
  trailing,
  action,
  className,
  ...rest
}: CatalogRowProps) {
  return (
    <div
      className={cn(
        // scroll-mt clears the catalog surfaces' sticky controls bar, so a
        // keyboard-focused row scrolled into view never parks hidden under it.
        "flex w-full scroll-mt-16 items-center rounded-xl transition-colors hover:bg-hover focus-within:bg-hover",
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
        {...rest}
      >
        {icon}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink text-sm">{title}</p>
          {description && (
            <p className="truncate text-[13px] text-ink-muted">{description}</p>
          )}
        </div>
        {trailing}
      </button>
      {action && <div className="shrink-0 pr-2.5">{action}</div>}
    </div>
  );
}

/** The row's install affordance: a GHOST round button carrying a full-ink `+`
 *  — transparent at rest so the icon itself is the accent, and on hover the
 *  circle fills with the elevated `input` surface (white in light mode),
 *  which pops against the row's own `hover` wash. `label` is the accessible
 *  name (the icon says nothing); `busy` swaps the plus for a spinner at full
 *  strength while THIS item installs (a disabled-but-busy button must not
 *  fade like a blocked one). */
export function CatalogAddButton({
  label,
  busy = false,
  className,
  disabled,
  ...rest
}: Omit<ComponentPropsWithoutRef<"button">, "children"> & {
  label: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || busy}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-ink transition-colors",
        "hover:bg-input focus-visible:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40",
        busy ? "" : "disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {busy ? (
        <Spinner className="size-4" />
      ) : (
        <Plus className="size-5" aria-hidden />
      )}
    </button>
  );
}
