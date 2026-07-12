"use client";

import { ChevronRight, Search } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../utils";

/**
 * The flat "catalog plane" family — the browse-page grammar shared by every
 * surface that lists installable/openable things (integrations, skills, AI
 * providers and models): chevroned section headings over a responsive
 * two-column grid of transparent rows that fill with the `hover` tone, plus
 * the icon-tile strip and the rounded search field.
 *
 * Deliberately domain-blind: rows take an `icon` node (the consumer owns brand
 * art vs letter avatars vs glyphs), a title + one-line description, and a
 * `trailing` node (a quiet `+`, a spinner, a lock, a chevron). All copy comes
 * from the consumer (ui/ stays i18n-agnostic).
 */

/** A section label — small heading with a trailing chevron accent. The chevron
 *  is visual, NOT navigation: a plain `<h2>`, no fake affordance. Sits directly
 *  under the page's h1 so headings never skip a level. */
export function CatalogSectionHeader({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "flex items-center gap-1 text-sm font-medium text-ink",
        className,
      )}
    >
      {title}
      <ChevronRight className="size-4 text-ink-muted" aria-hidden />
    </h2>
  );
}

/** The responsive section grid: one column, two from `lg`. */
export function CatalogGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-1 lg:grid-cols-2", className)}>
      {children}
    </div>
  );
}

export interface CatalogRowProps
  extends Omit<ComponentPropsWithoutRef<"button">, "children"> {
  /** Leading art (~40px): a brand logo, letter avatar, or glyph tile. */
  icon: ReactNode;
  title: string;
  /** One muted line, truncated. */
  description?: string;
  /** Right-edge affordance: a quiet `+`, a spinner, a lock, a chevron... */
  trailing?: ReactNode;
  /**
   * Inert-but-calm: the row ignores clicks WITHOUT looking greyed out (used
   * while a sibling's async action is in flight). It drops its hover fill and
   * pointer so the no-op reads intentionally quiet, never broken.
   */
  inert?: boolean;
}

/** One flat catalog row — the reference's GitHub-row look. The WHOLE row is
 *  the button (a generous hit target), transparent at rest, the `hover` fill
 *  sweeping the full row. Its accessible name is its text content. */
export function CatalogRow({
  icon,
  title,
  description,
  trailing,
  inert = false,
  className,
  disabled,
  ...rest
}: CatalogRowProps) {
  return (
    <button
      type="button"
      disabled={disabled || inert}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        "hover:bg-hover focus-visible:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40",
        inert
          ? "disabled:cursor-default disabled:opacity-100 disabled:hover:bg-transparent"
          : "disabled:pointer-events-none disabled:opacity-50",
        className,
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
  );
}

/** An icon tile for the "Installed" strip: a 48px hover-fill button whose
 *  content IS the art — no border, no chrome. Give it an `aria-label` (the
 *  tile has no text). */
export function CatalogTile({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex size-12 items-center justify-center rounded-xl transition-colors",
        "hover:bg-hover focus-visible:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** The quiet "Show all N" expander under a capped section. */
export function CatalogShowMore({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "mt-1 px-3 text-[13px] text-ink-muted transition-colors hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** The rounded catalog search field (magnifier inside-left). `label` is both
 *  the placeholder and the accessible name — the consumer passes localized
 *  copy. */
export function CatalogSearchField({
  value,
  onChange,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-ink-muted" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        aria-label={label}
        className="h-9 w-full rounded-full border border-line-input bg-input pr-4 pl-10 text-ink text-sm placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus/20"
      />
    </div>
  );
}
