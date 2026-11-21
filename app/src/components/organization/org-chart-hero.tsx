import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { OrgChartAreaChart } from "./org-chart-area-chart";
import { CAPTION } from "./org-chart-caption";
import { dayLabel } from "./org-chart-format";
import { HeroFigure, HeroSentence, HeroStats } from "./org-chart-hero-parts";
import type { HeroFigures, OrgChartScope } from "./org-chart-scope";
import type { OrgChartLead } from "./org-chart-view-model";

export interface HeroSeries {
  values: readonly number[];
  from: string;
}

const LEAD_COPY = {
  hours: {
    caption: "orgChart.heroHours",
    chart: "orgChart.chartHours",
    chartLabel: "orgChart.chartHoursLabel",
  },
  messages: {
    caption: "orgChart.heroMessages",
    chart: "orgChart.chartMessages",
    chartLabel: "orgChart.chartMessagesLabel",
  },
} as const;

const CAPTIONS = {
  org: "orgChart.caption",
  yours: "orgChart.captionYours",
  personal: "orgChart.captionPersonal",
} as const satisfies Record<OrgChartScope, string>;

export function OrgChartHero({
  title,
  lead,
  figures,
  series,
}: {
  title: string;
  lead: OrgChartLead | null;
  figures: HeroFigures;
  series: HeroSeries | null;
}) {
  const { t, i18n } = useTranslation("teams");
  const copy = lead && LEAD_COPY[lead.metric];
  const partialMessages = lead?.metric === "messages" && figures.messagesScoped;
  return (
    <header className="@container">
      <div
        className={cn(
          "flex flex-col gap-x-10 gap-y-6",
          lead && "md:flex-row md:flex-wrap md:items-end",
        )}
      >
        <div className="min-w-0 md:flex-1">
          <div className="flex flex-col gap-2.5 md:max-w-md md:gap-3">
            <span className={CAPTION}>{t(CAPTIONS[figures.scope])}</span>
            <h2 className="text-3xl leading-none font-medium tracking-tighter text-balance text-ink md:text-6xl">
              {title}
            </h2>
            <HeroSentence figures={figures} />
          </div>
        </div>
        {lead && copy && (
          <div className="flex min-w-0 shrink-0 flex-col gap-2.5">
            <span className={CAPTION}>
              {t(
                partialMessages ? "orgChart.heroMessagesManaged" : copy.caption,
              )}
            </span>
            <HeroFigure
              metric={lead.metric}
              loading={lead.loading}
              figures={figures}
            />
            <HeroStats metric={lead.metric} figures={figures} />
          </div>
        )}
        {lead && copy && (
          <div className="flex w-full min-w-0 flex-col gap-2 @6xl:w-110 @6xl:shrink-0">
            <span className={CAPTION}>
              {t(
                partialMessages ? "orgChart.chartMessagesManaged" : copy.chart,
              )}
            </span>
            {series && !lead.loading ? (
              <OrgChartAreaChart
                values={series.values}
                label={t(
                  partialMessages
                    ? "orgChart.chartMessagesManagedLabel"
                    : copy.chartLabel,
                )}
                from={dayLabel(i18n.language, series.from, {
                  month: "short",
                  day: "numeric",
                })}
                to={t("orgChart.today")}
                className="h-24 md:h-36"
              />
            ) : (
              <div className="flex flex-col gap-2">
                <div className="h-24 w-full rounded-xl bg-chip-subtle md:h-36" />
                <span className="h-4" />
              </div>
            )}
          </div>
        )}
      </div>
      <div
        aria-hidden="true"
        className="mt-7 h-px bg-ink md:mt-10 dark:bg-ink/60"
      />
    </header>
  );
}
