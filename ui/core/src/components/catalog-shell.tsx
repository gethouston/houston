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
 * it. The installed section is FLAT, exactly like the available browse below
 * it: its heading and the sections' shared vertical rhythm are the whole
 * separation. It wore a bordered card once, and the box read as a foreign
 * widget on an otherwise borderless page.
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
  controls?: ReactNode;
  installed?: ReactNode;
  installedTitle: string;
  installedCount?: number;
  availableTitle?: string;
  availableCount?: number | string;
  tabs: CatalogShellTab[];
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  const { sentinelRef, stuck } = useStuckOnScroll();
  return (
    <div className={className}>
      {controls != null && (
        <>
          <div ref={sentinelRef} aria-hidden className="h-0" />
          <div
            className={cn(
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
          <section>
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
