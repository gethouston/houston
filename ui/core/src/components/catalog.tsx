"use client";

import { Search } from "lucide-react";
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

/** The quiet count chip the catalog family shares (section headers, shell
 *  tabs): a small muted pill carrying how many items live in that group. */
export function CatalogCount({
  count,
  className,
}: {
  count: number;
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

/** A section label — small heading with an optional trailing count chip. A
 *  plain `<h2>`, no fake affordance. Sits directly under the page's h1 so
 *  headings never skip a level. */
export function CatalogSectionHeader({
  title,
  count,
  className,
}: {
  title: string;
  /** How many items the section holds; omit to hide the chip. */
  count?: number;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "flex items-center gap-2 text-sm font-medium text-ink",
        className,
      )}
    >
      {title}
      {count != null && <CatalogCount count={count} />}
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

/** An icon tile for the "Installed" strip: a 48px icon box whose content IS
 *  the art — no border, no chrome. Hover paints the SAME `hover` fill as the
 *  catalog rows on the icon box, and the tile's `label` fades in beneath it
 *  (space is reserved, so nothing reflows). `aria-label` pins the accessible
 *  name to exactly the label — the icon's own alt text stays out of it. */
export function CatalogTile({
  label,
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        // pb reserves the label line; the label itself is absolutely positioned
        // and centered so a long name shows IN FULL, overflowing the tile's
        // width without truncation and without shifting neighboring tiles.
        "group relative flex w-14 flex-col items-center pb-5 outline-none",
        className,
      )}
      {...rest}
    >
      <span
        className={cn(
          "flex size-12 items-center justify-center rounded-xl transition-colors",
          "group-hover:bg-hover group-focus-visible:bg-hover group-focus-visible:ring-2 group-focus-visible:ring-focus/40",
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          "-translate-x-1/2 absolute top-[52px] left-1/2 whitespace-nowrap text-[12px] text-ink-muted leading-4 opacity-0 transition-opacity",
          "group-hover:opacity-100 group-focus-visible:opacity-100",
        )}
      >
        {label}
      </span>
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
