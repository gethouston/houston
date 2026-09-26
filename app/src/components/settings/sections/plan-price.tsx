import type { PlanSummary } from "@houston/engine-adapter";
import { planPriceAmounts } from "@houston/sdk";
import { useTranslation } from "react-i18next";

export function PlanPrice({ plan }: { plan: PlanSummary }) {
  const { t, i18n } = useTranslation("plan");
  const price = planPriceAmounts(plan, i18n.language);
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm text-ink-muted">
      {price.compareAt && (
        <>
          <span aria-hidden className="line-through">
            {price.compareAt}
          </span>
          <span className="rounded-full bg-chip px-2 py-0.5 text-xs text-chip-text">
            {t("launchDiscount")}
          </span>
        </>
      )}
      {price.compareAt && (
        <span className="sr-only">
          {t("priceAccessible", {
            was: price.compareAt,
            now: price.current,
          })}
        </span>
      )}
      <span aria-hidden={price.compareAt ? true : undefined}>
        {t("price", { price: price.current })}
      </span>
    </span>
  );
}
