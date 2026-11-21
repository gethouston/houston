"use client";

import type { ReactNode } from "react";
import { useStuckOnScroll } from "../hooks/use-stuck-on-scroll";
import { cn } from "../utils";
import { CatalogCount, CatalogSectionHeader } from "./catalog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

export const CATALOG_INSTALLED_PREVIEW_CAP = 6;

export interface CatalogShellTab {
  value: string;
  label: string;
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
