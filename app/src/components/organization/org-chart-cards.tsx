import { Skeleton } from "@houston-ai/core";

/** The grid both the chart and its loading state are laid out on: one column of
 *  full-width cards on a phone, two columns once there is room for them. */
export const CARD_GRID = "grid grid-cols-1 gap-4 md:grid-cols-2";

/** The plane one team is drawn on: a `bg-card` surface lifted by the app's
 *  hairline inset ring, the same treatment every other card in Houston wears
 *  (the invite card, the skill editor's agents card). A 1px bordered box would
 *  be the filler chrome DESIGN.md §6 bans. Shared with the placeholder below so
 *  the card cannot change surface under the user when the data lands. */
export const CARD_SURFACE = "ht-hairline rounded-xl bg-card p-3 md:p-4";

/** One line of a placeholder agent row: its helmet, its name and its bar. */
function AgentRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-2 py-2">
      <Skeleton className="size-6 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-28 rounded-full" />
        <Skeleton className="mt-1.5 h-2 w-full rounded-full" />
      </div>
    </div>
  );
}

export function ChartSkeleton({ label }: { label: string }) {
  return (
    <ul className={CARD_GRID} aria-label={label} aria-busy="true">
      {[0, 1].map((card) => (
        <li key={card} className={CARD_SURFACE}>
          <div className="flex items-center gap-2.5 px-1 py-1">
            <Skeleton className="size-5 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-32 rounded-full" />
              <Skeleton className="mt-1.5 h-3 w-24 rounded-full" />
            </div>
          </div>

          <div className="mt-4 border-t border-line/60 pt-3">
            <Skeleton className="mb-2 h-4 w-24 rounded-full" />
            <div className="flex flex-col">
              {[0, 1, 2].map((row) => (
                <AgentRowSkeleton key={row} />
              ))}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
