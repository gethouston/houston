import { cn } from "@houston-ai/core";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * App-local layout primitives shared by every full-window surface (AI hub,
 * Integrations, Settings and its sections) so their width and header spacing stay
 * identical. Deliberately NOT in `ui/` — these encode Houston page chrome, not a
 * reusable widget, so they carry no inventory/parity churn. Props-only, no store
 * imports. The canon is the AI hub's structure: a centered `px-8` column (two
 * named widths — see {@link PageContainer}) with a 24px normal-weight title.
 * See /DESIGN.md.
 */

/**
 * The canonical horizontal container for a top-level surface: centered,
 * `px-8` gutters, one of exactly TWO caps. The single source of the shared
 * page widths. `default` (max-w-4xl, ~75ch of text) is for reading surfaces —
 * settings forms, prose, anything where a longer line gets harder to read.
 * `wide` (max-w-6xl) is for BROWSE surfaces under the full-width page header —
 * card grids and catalogs, which spend width on columns instead of line
 * length. Two named widths and not a free `className` override, so pages
 * cannot each drift a few pixels apart. Vertical padding is the caller's (top
 * surfaces open at `pt-10`, close at `pb-10`; the fixed-masthead surfaces
 * split that across two containers). Extra div props pass through so it can
 * also be the ARIA `tabpanel` of a surface.
 */
export function PageContainer({
  children,
  className,
  width = "default",
  ...rest
}: ComponentPropsWithoutRef<"div"> & { width?: "default" | "wide" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 md:px-8",
        width === "wide" ? "max-w-6xl" : "max-w-4xl",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

interface PageHeroProps {
  /** The words, or a node when the title carries a mark beside them (a team's
   *  glyph). It renders inside the one heading either way, so the typography
   *  and truncation are the header's, not the caller's. */
  title: ReactNode;
  /** Optional muted one-line subtitle under the title. */
  subtitle?: string;
  /** Optional right-aligned slot (e.g. a primary action), vertically top-aligned. */
  trailing?: ReactNode;
  /** Extra classes, typically the bottom gap to the content (e.g. `mb-6`). */
  className?: string;
  /**
   * Heading level, default 1. Pass 2 when the page's `<h1>` already lives in
   * its header strip (a lozenge cluster) and this hero titles a section BODY
   * under it — same typography, honest outline.
   */
  level?: 1 | 2;
  /** Optional id for naming controls associated with this visible heading. */
  titleId?: string;
}

/**
 * The canonical page hero for a top-level surface: a 24px normal-weight title
 * with an optional muted subtitle and an optional trailing slot. Guarantees the
 * four surfaces open with identical title typography and spacing.
 */
export function PageHero({
  title,
  subtitle,
  trailing,
  className,
  level = 1,
  titleId,
}: PageHeroProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <Heading id={titleId} className="text-2xl font-normal text-ink">
          {title}
        </Heading>
        {subtitle ? (
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  );
}
