import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../lib/purchase-policy";

/** The sign-in card's referral pitch is a purchase promotion in store apps. */
export function ReferralPanel() {
  const { t } = useTranslation("auth");
  if (!canPurchaseInApp()) return null;
  return (
    <div className="flex flex-col justify-between gap-6 bg-action p-6 text-action-text md:col-span-1 md:p-8">
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t("referral.title")}</h2>
        <p className="text-sm text-action-text/70">{t("referral.body")}</p>
      </div>
      <span className="inline-flex items-center self-start rounded-full border border-action-text/30 px-3 py-1 text-xs font-medium text-action-text/80">
        {t("referral.comingSoon")}
      </span>
    </div>
  );
}
