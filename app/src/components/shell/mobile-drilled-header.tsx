import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export function MobileDrilledHeader({
  backLabel,
  onBack,
  glyph,
  title,
  subtitle,
  trailing,
  testId,
}: {
  backLabel: string;
  onBack: () => void;
  glyph?: ReactNode;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
  testId: string;
}) {
  return (
    <div className="flex shrink-0 items-start gap-3 px-4 pt-4 pb-2">
      <button
        type="button"
        aria-label={backLabel}
        data-testid={testId}
        onClick={onBack}
        className="ht-hairline flex size-10 shrink-0 items-center justify-center rounded-full bg-chip text-ink transition-colors hover:bg-hover active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <ChevronLeft aria-hidden className="size-5" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="flex min-w-0 items-center gap-2 text-2xl font-normal text-ink">
          {glyph}
          <span className="min-w-0 truncate">{title}</span>
        </h1>
        <p className="mt-0.5 truncate text-sm text-ink-muted">{subtitle}</p>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}
