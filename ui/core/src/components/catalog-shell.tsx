"use client";

import type { ReactNode } from "react";
import { cn } from "../utils";
import { CatalogCount, CatalogSectionHeader } from "./catalog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

/**
 * The consolidated catalog layout: one "installed" strip of everything the
 * user already has — regardless of which source it came from — above tabs
 * that each browse one source of new things. The strip is identity, the tabs
 * are discovery, so the strip sits OUTSIDE the tabs and never changes when
 * the user switches between them.
 *
 * Domain-blind like the rest of the catalog family: the consumer owns the
 * strip's tiles, each tab's content, and every string. With a single tab the
 * chrome drops entirely and the content renders bare — a source that isn't
 * available on this host simply isn't a tab; with NO tabs (a read-only
 * surface) only the installed section renders.
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
  installed,
  installedTitle,
  installedCount,
  tabs,
  value,
  onValueChange,
  className,
}: {
  /** The consolidated strip (tiles / skeleton). Omit to hide the section. */
  installed?: ReactNode;
  /** Localized heading over the installed strip. */
  installedTitle: string;
  /** How many items the strip holds; omit to hide its count chip. */
  installedCount?: number;
  tabs: CatalogShellTab[];
  /** Controlled active tab — pass both to let strip tiles switch tabs. */
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  return (
    // Tighter than the tabs' own content rhythm: the strip's tiles already
    // reserve label space below themselves, so a full section gap here read
    // as a hole between the strip and the tab bar.
    <div className={cn("space-y-5", className)}>
      {installed != null && (
        <section>
          <CatalogSectionHeader
            title={installedTitle}
            count={installedCount}
            className="mb-4"
          />
          {installed}
        </section>
      )}

      {tabs.length === 0 ? null : tabs.length === 1 ? (
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
    </div>
  );
}
