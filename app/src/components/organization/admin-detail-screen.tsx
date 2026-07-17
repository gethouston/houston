import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The shared drill-in scaffold for the Admin dashboard's detail screens (a
 * section body, the Agents fleet drill-in, the People per-member lens): a
 * back-bar with a labelled chevron over a full-height scroll region. Extracted
 * so the three drill-ins share ONE frame instead of repeating the flex + scroll
 * chrome, and so `organization-view.tsx` stays a thin switch. `onBack` returns
 * to the level above (the index, the grid, or the roster); `backLabel` names it.
 */
export function AdminDetailScreen({
  backLabel,
  onBack,
  children,
}: {
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-8 pt-8 pb-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          {backLabel}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {children}
      </div>
    </div>
  );
}
