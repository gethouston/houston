import { Gift } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function PlanAnnouncementGift({
  offer,
  price,
  children,
}: {
  offer: { from: string; until: string; amount: string };
  price: string;
  children: ReactNode;
}) {
  const { t } = useTranslation("plan");
  return (
    <section
      aria-labelledby="plan-briefing-gift-title"
      className="plan-briefing-rise plan-briefing-stage-4 plan-briefing-gift relative mt-6 space-y-5 rounded-xl p-4 md:p-6"
    >
      <div className="relative flex gap-4">
        <span
          aria-hidden="true"
          className="plan-briefing-gift-icon flex size-10 shrink-0 items-center justify-center rounded-full border"
        >
          <Gift className="size-5" />
        </span>
        <div className="relative min-w-0 space-y-2">
          <p className="text-sm font-medium text-ink-muted">
            {t("announcementGiftLabel")}
          </p>
          <h3
            id="plan-briefing-gift-title"
            className="text-lg font-medium leading-snug text-ink"
          >
            {t("announcementGiftTitle", { amount: offer.amount })}
          </h3>
          <p className="text-sm leading-relaxed text-ink-muted">
            {t("announcementGiftBody", {
              date: offer.from,
              until: offer.until,
              amount: offer.amount,
              price,
            })}
          </p>
        </div>
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}
