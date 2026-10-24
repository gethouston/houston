import type { OrgBilling } from "@houston/engine-adapter";
import {
  formatLocalDate,
  formatPlanAmount,
  nextAdjustmentView,
} from "@houston/sdk";
import { useTranslation } from "react-i18next";
import { BILLING_CURRENCY } from "./billing-tab-model.ts";

/**
 * A yearly org's next true-up, for the person who pays it: what Stripe
 * charges for members added mid-year (or credits for members removed), and
 * on which day. The SDK decides whether there is one (`nextAdjustmentView`);
 * with nothing pending nothing renders.
 */
export function BillingNextAdjustment({
  billing,
  now,
}: {
  billing: OrgBilling;
  now: number;
}) {
  const { t, i18n } = useTranslation("teams");
  const view = nextAdjustmentView(billing, now);
  if (!view) return null;
  const amount = formatPlanAmount(
    view.amountCents,
    BILLING_CURRENCY,
    i18n.language,
  );
  const date = formatLocalDate(view.at, i18n.language);
  return (
    <div
      className="space-y-1"
      data-testid="billing-next-adjustment"
      data-kind={view.kind}
    >
      <p className="text-sm tabular-nums">
        {t(`billing.nextAdjustment.${view.kind}.line`, { amount, date })}
      </p>
      <p className="text-sm text-ink-muted">
        {t(`billing.nextAdjustment.${view.kind}.hint`)}
      </p>
    </div>
  );
}
