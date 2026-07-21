"use client";

import { Search } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../utils";

/**
 * The flat "catalog plane" family — the browse-page grammar shared by every
 * surface that lists installable/openable things (integrations, skills, AI
 * providers and models): chevroned section headings over a responsive
 * two-column grid of transparent rows that fill with the `hover` tone, plus
 * the rounded search field.
 *
 * Deliberately domain-blind: rows take an `icon` node (the consumer owns brand
 * art vs letter avatars vs glyphs), a title + one-line description, and a
 * `trailing` node (a quiet `+`, a spinner, a lock, a chevron). All copy comes
 * from the consumer (ui/ stays i18n-agnostic).
 */

/** The quiet count chip the catalog family shares (section headers, shell
 *  tabs): a small muted pill carrying how many items live in that group. A
 *  string is rendered verbatim — a preformatted display label (e.g. `"9000+"`)
 *  for catalogs whose true total isn't cheaply known. */
export function CatalogCount({
  count,
  className,
}: {
  count: number | string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full bg-chip-subtle px-1.5 py-0.5 font-medium text-[11px] text-ink-muted leading-none tabular-nums",
        className,
      )}
    >
      {count}
    </span>
  );
}

/** A section label — heading with an optional trailing count chip. No fake
 *  affordance. `size="lg"` marks the page's top-level sections (Installed /
 *  Available), sitting directly under the page's h1; the default `sm` is for the
 *  sub-groupings inside them (categories / Featured). Renders `<h2>` by default;
 *  pass `as="h3"` for an sm sub-group nested UNDER an lg section header so the
 *  document outline never skips a level (page h1 → section h2 → sub-group h3). */
export function CatalogSectionHeader({
  title,
  count,
  size = "sm",
  as: Tag = "h2",
  className,
}: {
  title: string;
  /** How many items the section holds; omit to hide the chip. A string is a
   *  preformatted display label (e.g. `"9000+"`) for a total not cheaply known. */
  count?: number | string;
  size?: "sm" | "lg";
  /** Heading level. Default `h2`; use `h3` when nested under an lg section
   *  header so screen-reader outlines don't skip a level. */
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag
      className={cn(
        "flex items-center gap-2 text-ink",
        size === "lg" ? "text-base font-semibold" : "text-sm font-medium",
        className,
      )}
    >
      {title}
      {count != null && <CatalogCount count={count} />}
    </Tag>
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
