import { CatalogGrid, Skeleton } from "@houston-ai/core";

const ROW_KEYS = ["a", "b", "c", "d", "e", "f"] as const;
const SECTION_KEYS = ["first", "second"] as const;

function RowSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Skeleton className="size-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-36" />
      </div>
      {action && <Skeleton className="size-9 shrink-0 rounded-full" />}
    </div>
  );
}

export function InstalledSkeleton() {
  return (
    <div aria-hidden>
      <CatalogGrid>
        {ROW_KEYS.map((key) => (
          <RowSkeleton key={key} />
        ))}
      </CatalogGrid>
    </div>
  );
}

export function CatalogSkeleton() {
  return (
    <div aria-hidden className="space-y-8">
      {SECTION_KEYS.map((section) => (
        <section key={section}>
          <Skeleton className="mb-3 h-5 w-40" />
          <CatalogGrid>
            {ROW_KEYS.map((row) => (
              <RowSkeleton key={row} action />
            ))}
          </CatalogGrid>
          <Skeleton className="mt-1 ml-3 h-5 w-36" />
        </section>
      ))}
    </div>
  );
}
