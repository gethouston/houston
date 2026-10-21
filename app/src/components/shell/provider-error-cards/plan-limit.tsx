/**
 * A weekly usage limit, reached: when it resets and what the reader can do
 * about it. A free org's pool (`scope` `org`, or none from an older gateway)
 * offers its billing owner the Upgrade that opens the org's Billing, and
 * tells everyone else to ask the owner. The store apps never send anyone to
 * upgrade: the owner reads that the plan is managed on the web, as plain text
 * in the body, and everyone else only when the pool resets. A paid seat's
 * own allowance (`seat`), and any org whose billing is not a free org's,
 * only says when it resets.
 *
 * Split from `limits.tsx` (the provider-account limits) so this card loads
 * without the provider-card helpers.
 */

import { formatLocalDateTime } from "@houston/sdk";
import type { ProviderError } from "@houston-ai/chat";
import { TimerResetIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useActiveOrgBilling } from "../../../hooks/queries/use-billing";
import { openAdmin } from "../../../lib/open-admin";
import { canPurchaseInApp } from "../../../lib/purchase-policy";
import { RowCard } from "../../cards/row-card";
import { RowCardButton } from "../../cards/row-card-button";

/** Whose words the card speaks: one per reader and surface. */
type LimitVoice = "seat" | "upgrade" | "web" | "askOwner" | "member";

const BODY = {
  seat: ["plan:limitBodyResetOnly", "plan:limitBodyResetOnlyNoTime"],
  upgrade: ["plan:limitBody", "plan:limitBodyNoTime"],
  web: ["plan:native.limitBody", "plan:native.limitBodyNoTime"],
  askOwner: ["plan:limitBodyMember", "plan:limitBodyMemberNoTime"],
  member: ["plan:native.limitBodyMember", "plan:native.limitBodyMemberNoTime"],
} as const satisfies Record<LimitVoice, readonly [string, string]>;

export function PlanMessageLimitCard({
  error,
}: {
  error: Extract<ProviderError, { kind: "plan_message_limit" }>;
}) {
  const { t, i18n } = useTranslation("plan");
  const { billing } = useActiveOrgBilling();
  const purchasable = canPurchaseInApp();
  // Only a free org's pool has an upgrade to offer. A seat's allowance, a
  // card kept in history after the org went paid, and an org whose billing is
  // unknown (legacy, or the list unread) only say when the limit resets.
  const voice: LimitVoice =
    error.scope === "seat" || billing?.tier !== "free"
      ? "seat"
      : !billing.isBillingOwner
        ? purchasable
          ? "askOwner"
          : "member"
        : purchasable
          ? "upgrade"
          : "web";
  const time = Number.isFinite(Date.parse(error.resets_at))
    ? formatLocalDateTime(error.resets_at, i18n.language)
    : null;
  const [withTime, noTime] = BODY[voice];
  return (
    <div className="w-full px-1 py-2">
      <RowCard
        media={<TimerResetIcon className="size-5" />}
        title={t("plan:limitTitle")}
        description={time ? t(withTime, { time }) : t(noTime)}
        action={
          voice === "upgrade" ? (
            <RowCardButton
              label={t("plan:upgrade")}
              onClick={() => openAdmin({ section: "billing" })}
            />
          ) : undefined
        }
      />
    </div>
  );
}
