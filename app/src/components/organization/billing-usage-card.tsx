import type { OrgBilling } from "@houston/engine-adapter";
import { formatLocalDateTime, usagePercent } from "@houston/sdk";
import { Card, cn, Progress } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/**
 * A free org's weekly pool: how much of the week everyone in the org has used,
 * and when it resets. A share, never a message count.
 */
export function BillingUsageCard({ billing }: { billing: OrgBilling }) {
  const { t, i18n } = useTranslation("teams");
  const percent = usagePercent(billing) ?? 0;
  const used = t("billing.usageUsed", { percent });
  const resetsAt = billing.usage?.resetsAt ?? "";
  const footer = Number.isFinite(Date.parse(resetsAt))
    ? t("billing.usageShared", {
        time: formatLocalDateTime(resetsAt, i18n.language),
      })
    : t("billing.usageSharedNoTime");
  return (
    <Card className="gap-3 px-5 py-5 md:px-6" data-testid="billing-usage">
      <h2 className="text-sm font-medium">{t("billing.usageTitle")}</h2>
      <p
        className={cn(
          "text-sm tabular-nums",
          percent === 100 && "text-danger-ink",
        )}
      >
        {used}
      </p>
      <Progress value={percent} aria-label={used} />
      <p className="text-sm text-ink-muted">{footer}</p>
    </Card>
  );
}
