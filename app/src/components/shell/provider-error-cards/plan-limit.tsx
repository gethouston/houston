/**
 * The Free plan's weekly message limit, reached: when it resets and, where
 * Houston may sell (`canPurchaseInApp`), the way to Plus. The store apps say
 * the plan is managed on the web instead, as plain text in the body.
 *
 * Split from `limits.tsx` (the provider-account limits) so this card loads
 * without the provider-card helpers.
 */

import { formatLocalDateTime } from "@houston/sdk";
import type { ProviderError } from "@houston-ai/chat";
import { TimerResetIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../../lib/purchase-policy";
import { useUIStore } from "../../../stores/ui";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";

export function PlanMessageLimitCard({
  error,
}: {
  error: Extract<ProviderError, { kind: "plan_message_limit" }>;
}) {
  const { t, i18n } = useTranslation("plan");
  const openSettings = useUIStore((s) => s.openSettings);
  const purchasable = canPurchaseInApp();
  const time = Number.isFinite(Date.parse(error.resets_at))
    ? formatLocalDateTime(error.resets_at, i18n.language)
    : null;
  const description = purchasable
    ? time
      ? t("plan:limitBody", { time })
      : t("plan:limitBodyNoTime")
    : time
      ? t("plan:native.limitBody", { time })
      : t("plan:native.limitBodyNoTime");
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<TimerResetIcon className="size-5" />}
        title={t("plan:limitTitle")}
        description={description}
        action={
          purchasable ? (
            <RowCardButton
              label={t("plan:upgrade")}
              onClick={() => openSettings("plan")}
            />
          ) : undefined
        }
      />
    </div>
  );
}
