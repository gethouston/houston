import type { BillingInterval, SeatPrices } from "@houston/engine-adapter";
import {
  formatPlanAmount,
  type SeatPlan,
  seatPlans,
  yearlySavingsPercent,
} from "@houston/sdk";
import { cn } from "@houston-ai/core";
import { Check } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { RowTag } from "../shell/free-org-picker-rows.tsx";
import { BILLING_CURRENCY } from "./billing-tab-model.ts";

/**
 * Monthly or yearly, before a checkout: one row per interval the gateway
 * sells, each with its per-member price. The whole row is the hit target (a
 * native radio inside the label, so the arrow keys move the pick) and the
 * picked row wears an ink ring and a filled check, so it reads without
 * hovering. Stacked at every width: the yearly line is long, and a column
 * keeps both rows the same width in a dialog and on the Billing card. Yearly
 * wears what it saves, worked out from the wire's two prices.
 */
export function SeatIntervalChoice({
  prices,
  value,
  onChange,
  disabled,
  yearlyFirst = false,
}: {
  prices: SeatPrices;
  value: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  disabled?: boolean;
  /** Lead with yearly, where yearly is the offer (the promo-ended notice). */
  yearlyFirst?: boolean;
}) {
  const { t } = useTranslation("teams");
  // Two choices can share a screen (the Billing tab and the status strip's
  // dialog), so each group names its own radios.
  const group = useId();
  const saves = yearlySavingsPercent(prices);
  return (
    <div
      role="radiogroup"
      aria-label={t("billing.interval.label")}
      data-testid="seat-interval-choice"
      className="flex flex-col gap-2"
    >
      {(yearlyFirst ? [...seatPlans(prices)].reverse() : seatPlans(prices)).map(
        (plan) => (
          <IntervalRow
            key={plan.interval}
            group={group}
            plan={plan}
            saves={plan.interval === "year" ? saves : null}
            checked={plan.interval === value}
            disabled={disabled}
            onSelect={() => onChange(plan.interval)}
          />
        ),
      )}
    </div>
  );
}

function IntervalRow({
  group,
  plan,
  saves,
  checked,
  disabled,
  onSelect,
}: {
  group: string;
  plan: SeatPlan;
  saves: number | null;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const { t, i18n } = useTranslation("teams");
  const money = (cents: number) =>
    formatPlanAmount(cents, BILLING_CURRENCY, i18n.language);
  return (
    <label
      data-interval={plan.interval}
      className={cn(
        "grid cursor-pointer grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-chip px-3.5 py-3 outline outline-1 -outline-offset-1 outline-line has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus md:px-4",
        checked && "bg-hover outline-2 -outline-offset-2 outline-ink",
        disabled && "cursor-default opacity-45",
      )}
    >
      <input
        type="radio"
        className="sr-only"
        name={group}
        value={plan.interval}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink">
            {t(`billing.interval.${plan.interval}`)}
          </span>
          {saves !== null && (
            <RowTag label={t("billing.interval.save", { percent: saves })} />
          )}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted tabular-nums">
          {plan.interval === "month"
            ? t("billing.interval.monthMeta", {
                price: money(plan.perMonthCents),
              })
            : t("billing.interval.yearMeta", {
                price: money(plan.perMonthCents),
                yearly: money(plan.seatCents),
              })}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "grid size-5.5 place-items-center rounded-full outline outline-2 -outline-offset-2 outline-line-input",
          checked && "bg-ink outline-0",
        )}
      >
        {checked && <Check className="size-3.5 text-dialog" strokeWidth={3} />}
      </span>
    </label>
  );
}
