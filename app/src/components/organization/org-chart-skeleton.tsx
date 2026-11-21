import { cn, Skeleton } from "@houston-ai/core";

export function OrgChartLedgerSkeleton({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  const rows = (
    <div className={cn("flex flex-col", className)}>
      <Skeleton className="mb-3 h-3 w-32 rounded-full md:mb-4" />
      <div className="flex h-24 items-center gap-3 rounded-2xl bg-card-solid px-3.5 ht-hairline shadow-edge md:px-4">
        <Skeleton className="ml-6 size-11 shrink-0 rounded-full md:ml-11 md:size-14" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-36 rounded-full md:h-5" />
          <Skeleton className="h-3 w-52 rounded-full" />
        </div>
      </div>
      <div className="mt-2 flex flex-col md:mt-17">
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            className="flex h-24 items-center gap-3 border-t border-line md:h-19 md:px-4"
          >
            <Skeleton className="ml-6 size-8 shrink-0 rounded-full md:ml-11 md:size-10" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-28 rounded-full" />
              <Skeleton className="h-3 w-40 rounded-full" />
            </div>
            <Skeleton className="hidden h-0.75 w-1/3 rounded-full md:block" />
          </div>
        ))}
      </div>
    </div>
  );
  if (!label) return rows;
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {rows}
    </div>
  );
}

export function OrgChartSkeleton({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="flex flex-col"
    >
      <div className="@container">
        <div className="flex flex-col gap-x-10 gap-y-6 md:flex-row md:flex-wrap md:items-end">
          <div className="min-w-0 md:flex-1">
            <div className="flex flex-col gap-2.5 md:gap-3">
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton className="h-7 w-48 rounded-full md:h-13 md:w-80" />
              <Skeleton className="h-4 w-64 rounded-full md:w-96" />
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2.5">
            <Skeleton className="h-3 w-24 rounded-full" />
            <Skeleton className="h-14 w-44 rounded-2xl md:h-21.5 md:w-60" />
            <Skeleton className="h-4 w-56 rounded-full" />
          </div>
          <div className="flex w-full flex-col gap-2 @6xl:w-110 @6xl:shrink-0">
            <Skeleton className="h-3 w-40 rounded-full" />
            <Skeleton className="h-24 w-full rounded-xl md:h-36" />
            <span className="h-4" />
          </div>
        </div>
        <div className="mt-7 h-px bg-line md:mt-10" />
      </div>
      <OrgChartLedgerSkeleton className="mt-7 md:mt-10" />
    </div>
  );
}
