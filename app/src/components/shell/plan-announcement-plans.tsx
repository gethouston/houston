import type { planAnnouncementView } from "@houston/sdk";
import { useTranslation } from "react-i18next";

export function PlanAnnouncementPlans({
  view,
}: {
  view: ReturnType<typeof planAnnouncementView>;
}) {
  const { t } = useTranslation("plan");
  return (
    <section
      aria-label={
        view.starts
          ? t("announcementPlans", { date: view.starts })
          : t("announcementPlansNow")
      }
      className="plan-briefing-rise plan-briefing-stage-3"
    >
      <p className="mb-4 text-sm font-medium text-ink-muted">
        {view.starts
          ? t("announcementPlans", { date: view.starts })
          : t("announcementPlansNow")}
      </p>
      <div className="grid gap-3 md:grid-cols-3 md:gap-4">
        <div className="flex flex-col gap-3 py-4 md:py-5">
          <p className="text-sm font-medium text-ink-muted">{t("free")}</p>
          <p className="text-3xl font-medium tracking-tight tabular-nums text-ink">
            {view.free}
          </p>
          <p className="text-xs leading-relaxed text-ink-muted">
            {t("announcementFreeDescription")}
          </p>
        </div>
        <div className="plan-briefing-plus relative flex flex-col gap-3 rounded-lg p-4 md:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-ink">{t("plus")}</p>
            {view.plus.compareAt && (
              <span className="rounded-full border border-line px-2 py-1 text-xs text-ink">
                {t("launchDiscount")}
              </span>
            )}
          </div>
          <p className="flex flex-wrap items-baseline gap-2 tabular-nums">
            {view.plus.compareAt && (
              <>
                <s aria-hidden="true" className="text-sm text-ink-muted">
                  {view.plus.compareAt}
                </s>
                <span className="sr-only">
                  {t("priceAccessible", {
                    was: view.plus.compareAt,
                    now: view.plus.current,
                  })}
                </span>
              </>
            )}
            <span
              aria-hidden={view.plus.compareAt ? true : undefined}
              className="text-3xl font-medium tracking-tight text-ink"
            >
              {view.plus.current}
            </span>
            <span
              aria-hidden={view.plus.compareAt ? true : undefined}
              className="text-xs text-ink-muted"
            >
              {t("announcementPerMonth")}
            </span>
          </p>
          <p className="text-xs leading-relaxed text-ink-muted">
            {t("announcementPlusDescription")}
          </p>
        </div>
        <div className="flex flex-col gap-3 py-4 md:py-5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-ink-muted">
              {t("announcementTeams")}
            </p>
            <span className="rounded-full border border-line px-2 py-1 text-xs text-ink-muted">
              {t("announcementComingSoon")}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-ink-muted">
            {t("announcementTeamsDescription")}
          </p>
        </div>
      </div>
    </section>
  );
}
