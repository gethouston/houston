import type { SeatUsageView } from "@houston/sdk";
import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/** More dots than this stop reading as seats; the line still counts them. */
const MAX_DOTS = 24;

/**
 * A yearly org's paid seats that nobody uses: one dot per paid seat (filled
 * in use, hollow free), the count, and what a free seat means. Shown only
 * while a paid seat is free.
 */
export function BillingSeatUsage({
  usage,
  pays,
}: {
  usage: SeatUsageView;
  pays: boolean;
}) {
  const { t } = useTranslation("teams");
  if (usage.free === 0) return null;
  const dots = Math.min(usage.paidSeats, MAX_DOTS);
  return (
    <div className="flex flex-col gap-2" data-testid="billing-seat-usage">
      <div aria-hidden="true" className="flex flex-wrap gap-1.5">
        {Array.from({ length: dots }, (_, seat) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: seats have no identity, only a position.
            key={seat}
            className={cn(
              "size-2.5 rounded-full",
              seat < usage.inUse
                ? "bg-ink"
                : "ring-[1.5px] ring-ink-muted ring-inset",
            )}
          />
        ))}
      </div>
      <p className="text-sm tabular-nums">
        {t("billing.inUse", { used: usage.inUse, count: usage.free })}
      </p>
      <p className="text-sm text-ink-muted">
        {t(pays ? "billing.freeHelp" : "billing.freeHelpOther")}
      </p>
    </div>
  );
}
