"use client";

import type { ReactNode } from "react";
import { useStuckOnScroll } from "../hooks/use-stuck-on-scroll";
import { cn } from "../utils";
import { CatalogCount, CatalogSectionHeader } from "./catalog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

/** How many installed rows the strip shows at rest before collapsing behind a
 *  "Show all N" expander, so a well-stocked strip never pushes the discovery
 *  content below the fold. An active search or filter shows every match
 *  (filtering IS the act of looking past the preview). Consumers share the
 *  one cap so surfaces don't drift. */
export const CATALOG_INSTALLED_PREVIEW_CAP = 6;

/**
 * The consolidated catalog layout: ONE controls row (the surface's single
 * search field + filters) over two clearly-titled sections — an "installed"
 * strip of everything the user already has, then the "available" discovery
 * area (tabs when it has more than one source). The one query in `controls`
 * filters BOTH sections; the consumer owns that state and simply renders
 * matching rows into each slot, omitting a section that has no matches.
 *
 * The controls row is STICKY: it pins to the top of the surface's scroll
 * container so search + filters stay reachable through a long catalog, fading
 * in an opaque `popover` fill (transparent at rest) only while rows pass behind
 * it. The installed section is a quiet CONTAINED panel (a rounded, hairline-
 * bordered `card` surface) so "yours" reads as its own thing above the flat
 * "available" browse below.
 *
 * Domain-blind like the rest of the catalog family: the consumer owns the
 * controls, the strip's rows, each tab's content, and every string. With a
 * single tab the tab chrome drops and the available section renders its
 * header straight over the content; with NO tabs (a read-only surface) only
 * the installed section renders.
 */

export interface CatalogShellTab {
  value: string;
  /** Localized trigger label. */
  label: string;
  /** How many items the tab browses; omit to hide its count chip. */
  count?: number;
  content: ReactNode;
}

export function CatalogShell({
  controls,
  installed,
  installedTitle,
  installedCount,
  availableTitle,
  availableCount,
  tabs,
  value,
  onValueChange,
  className,
}: {
  /** The surface's ONE search-and-filters row, rendered STICKY above both
   *  sections. The consumer owns the state and filters both sections with it.
   *  The sticky wrapper renders only when this is provided. */
  controls?: ReactNode;
  /** The consolidated strip (rows / skeleton). Omit to hide the section —
   *  including when an active query matches nothing installed. */
  installed?: ReactNode;
  /** Localized heading over the installed strip. */
  installedTitle: string;
  /** How many items the strip currently shows (matches while filtering,
   *  the total at rest); omit to hide its count chip. */
  installedCount?: number;
  /** Localized heading over the discovery area. Omit to render tabs bare
   *  (legacy surfaces without the two-section grammar). */
  availableTitle?: string;
  /** How many items are available (matches while filtering, the total at
   *  rest); omit to hide the chip. A string is a preformatted display label
   *  (e.g. `"9000+"`) for a catalog whose true total isn't cheaply known. */
  availableCount?: number | string;
  tabs: CatalogShellTab[];
  /** Controlled active tab — pass both to let strip rows switch tabs. */
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  const { sentinelRef, stuck } = useStuckOnScroll();
  return (
    <div className={className}>
      {controls != null && (
        <>
          {/* Zero-height marker at the controls' natural top (see useStuckOnScroll). */}
          <div ref={sentinelRef} aria-hidden className="h-0" />
          <div
            className={cn(
              // rounded-b is unconditional so only the fill animates in —
              // a conditional radius would snap while the color eases.
              "sticky top-0 z-20 rounded-b-2xl pt-2 pb-3 transition-colors",
              stuck && "bg-popover",
            )}
          >
            {controls}
          </div>
        </>
      )}

      <div className={cn("space-y-8", controls != null && "mt-4")}>
        {installed != null && (
          <section className="rounded-2xl border border-line bg-card p-4">
            <CatalogSectionHeader
              title={installedTitle}
              count={installedCount}
              size="lg"
              className="mb-4"
            />
            {installed}
          </section>
        )}

        {tabs.length === 0 ? null : (
          <section>
            {availableTitle != null && (
              <CatalogSectionHeader
                title={availableTitle}
                count={availableCount}
                size="lg"
                className="mb-4"
              />
            )}
            {tabs.length === 1 ? (
              tabs[0].content
            ) : (
              <Tabs value={value} onValueChange={onValueChange}>
                <TabsList variant="line" className="mb-4">
                  {tabs.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value}>
                      {tab.label}
                      {tab.count != null && <CatalogCount count={tab.count} />}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tabs.map((tab) => (
                  <TabsContent key={tab.value} value={tab.value}>
                    {tab.content}
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
