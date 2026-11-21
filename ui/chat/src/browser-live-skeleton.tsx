"use client";

import { Skeleton } from "@houston-ai/core";

const BAR = "motion-reduce:animate-none";

export function BrowserLiveSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex size-full flex-col gap-4 overflow-hidden rounded-md bg-background p-4 shadow-edge md:max-w-3xl md:p-8"
      data-testid="browser-live-skeleton"
    >
      <Skeleton className={`h-8 w-full ${BAR}`} />
      <Skeleton className={`mt-4 h-6 w-1/2 ${BAR}`} />
      <div className="flex flex-col gap-2">
        <Skeleton className={`h-3 w-24 ${BAR}`} />
        <Skeleton className={`h-10 w-full ${BAR}`} />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className={`h-3 w-20 ${BAR}`} />
        <Skeleton className={`h-10 w-full ${BAR}`} />
      </div>
      <Skeleton className={`h-10 w-28 rounded-full ${BAR}`} />
    </div>
  );
}
