"use client";

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
 *  sub-groupings inside them (categories / Featured). Both are deliberately
 *  QUIET — 14px and 13px medium, not display type: on a page whose identity
 *  already lives in the header's lozenge, a bold section title competes with
 *  the rows it introduces. Renders `<h2>` by default; pass `as="h3"` for an sm
 *  sub-group nested UNDER an lg section header so the document outline never
 *  skips a level (page h1 → section h2 → sub-group h3). */
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
        size === "lg" ? "text-sm font-medium" : "text-[13px] font-medium",
        className,
      )}
    >
      {title}
      {count != null && <CatalogCount count={count} />}
    </Tag>
  );
}

/** The catalog plane's natural full width: two capped cells plus their gap
 *  (2 × 23rem + 0.25rem). A surface that wants the plane CENTERED on a wide
 *  page caps its whole catalog column to this and lets the margins take the
 *  rest — capping only the grid would leave the slack piled on the right,
 *  with the rows sitting left of the headings' column. Derived here, beside
 *  the cell cap, so the two can never drift apart. */
export const CATALOG_PLANE_MAX_W = "max-w-[46.25rem]";

/** The responsive section grid: one column narrow, TWO at most — and each
 *  cell caps at 23rem, the width a row's logo + name + one-line description
 *  actually earn. Both limits are deliberate: three columns read as crowded,
 *  and two uncapped columns on a wide page stretch every row into a bar of
 *  whitespace. So past ~two-caps-wide the grid stops growing and the page's
 *  margin takes the rest ({@link CATALOG_PLANE_MAX_W} is how a surface
 *  centers that remainder). Container-measured, not viewport-measured: a
 *  catalog inside a narrow pane (an agent's Apps section beside an open chat
 *  panel) must never inherit the window's column count and squeeze.
 *
 *  The two-column switch (`@2xl`, 42rem) MUST sit below
 *  {@link CATALOG_PLANE_MAX_W} (46.25rem): a plane capped to that width is
 *  itself the container, and a higher threshold would mean the centered
 *  plane can never earn the second column it was sized for. */
export function CatalogGrid({
  children,
  className,
  columns = "auto",
}: {
  children: ReactNode;
  className?: string;
  /** `1` pins a single uncapped column (list-style surfaces); `auto` flows
   *  1 → 2 capped cells with the container's width. A prop and not a class
   *  override, so column behavior stays in one place instead of scattered
   *  variant strings. */
  columns?: "auto" | 1;
}) {
  return (
    <div className="@container">
      <div
        className={cn(
          "grid grid-cols-1 gap-1",
          columns === "auto" && "@2xl:grid-cols-[repeat(2,minmax(0,23rem))]",
          className,
        )}
      >
        {children}
      </div>
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
