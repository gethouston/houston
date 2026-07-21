import { Spinner, Tabs, TabsList, TabsTrigger } from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMyAnalytics } from "../../../hooks/use-my-analytics";
import { InstallsChart } from "./installs-chart";
import {
  ANALYTICS_RANGES,
  type AnalyticsRange,
  buildInstallsModel,
} from "./installs-model";

/** Localized calendar label for a bucket's UTC day. */
function dayLabel(
  language: string,
  day: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(language, {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/**
 * The creator's install analytics: a per-day bar chart plus a per-agent
 * breakdown, over a 7 / 30 / 90-day window. Self-contained — reads
 * `useMyAnalytics` (enabled only when signed in; the query key rides `days`, so
 * each window caches independently) and re-buckets locally via
 * `buildInstallsModel`. The total line always equals the charted bars.
 */
export function AnalyticsPanel() {
  const { t, i18n } = useTranslation("store");
  const [range, setRange] = useState<AnalyticsRange>(7);
  const { data, isLoading, isError } = useMyAnalytics(range);

  const model = useMemo(
    () => buildInstallsModel(data?.rows ?? [], range, Date.now()),
    [data, range],
  );
  // Selective direct labels: every nonzero bar on the roomy 7-day view; only
  // the tallest bar on dense views (the tooltip covers the rest).
  const tallestIndex = model.buckets.findIndex(
    (bucket) =>
      bucket.installs > 0 && bucket.installs === model.maxBucketInstalls,
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-ink">{t("analytics.title")}</h2>
        <Tabs
          value={String(range)}
          onValueChange={(value) => setRange(Number(value) as AnalyticsRange)}
        >
          <TabsList>
            {ANALYTICS_RANGES.map((days) => (
              <TabsTrigger key={days} value={String(days)}>
                {t(`analytics.range.${days}d`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : isError ? (
        <p className="py-6 text-center text-sm text-ink-muted">
          {t("analytics.loadFailed")}
        </p>
      ) : model.totalInstalls === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">
          {t("analytics.empty")}
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            {t("analytics.totalInstalls", { count: model.totalInstalls })}
          </p>
          <InstallsChart
            buckets={model.buckets}
            max={model.maxBucketInstalls}
            barLabel={(bucket) =>
              t("analytics.barLabel", {
                day: dayLabel(i18n.language, bucket.day, {
                  month: "short",
                  day: "numeric",
                }),
                count: bucket.installs,
              })
            }
            axisLabel={(bucket) =>
              dayLabel(
                i18n.language,
                bucket.day,
                range === 7
                  ? { weekday: "short" }
                  : { month: "short", day: "numeric" },
              )
            }
            valueLabel={(bucket, index) => {
              if (bucket.installs === 0) return null;
              if (range !== 7 && index !== tallestIndex) return null;
              return String(bucket.installs);
            }}
          />
          <ul className="flex flex-col">
            {model.perAgent.map((agent) => {
              const pct = Math.max(
                2,
                Math.round((agent.installs / model.maxAgentInstalls) * 100),
              );
              return (
                <li
                  key={agent.agentId}
                  className="flex flex-col gap-1.5 border-b border-line/40 py-3 last:border-0"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-ink">
                      {agent.slug ?? agent.agentId}
                    </span>
                    <span className="shrink-0 text-sm text-ink-muted">
                      {t("installs", { count: agent.installs })}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-chip">
                    <div
                      className="h-full rounded-full bg-action"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
