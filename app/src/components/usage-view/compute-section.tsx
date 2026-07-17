import {
  Empty,
  EmptyDescription,
  EmptyTitle,
  resolveAgentColor,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useComputeUsage } from "../../hooks/queries";
import { useAgentStore } from "../../stores/agents";
import { agentLabel } from "../organization/org-roster";
import { ComputeAgentRow } from "./compute-agent-row";
import { ComputeBarChart } from "./compute-bar-chart";
import {
  bucketCompute,
  type ComputeRange,
  durationParts,
  isOpaqueSlug,
} from "./compute-usage-model";

const RANGES: ComputeRange[] = ["week", "month", "quarter"];

type Translate = ReturnType<typeof useTranslation>["t"];

/** Compose a duration from locale templates ("2h 05m" / "45m" / "<1m"). */
function formatDuration(t: Translate, ms: number): string {
  const parts = durationParts(ms);
  switch (parts.kind) {
    case "zero":
      return t("usage.compute.duration.zero");
    case "underMinute":
      return t("usage.compute.duration.underMinute");
    case "minutes":
      return t("usage.compute.duration.m", { minutes: parts.minutes });
    case "hoursMinutes":
      return t("usage.compute.duration.hm", {
        hours: parts.hours,
        minutes: parts.minutes,
      });
  }
}

/** Localized calendar label for a bucket's UTC start day. */
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
 * "Time worked": how long this user's agents actually spent executing tasks,
 * per day/week, with a per-agent breakdown. The full pod up-time (`awakeMs`)
 * is deliberately never shown. Rendered ONLY where the gateway advertises
 * `capabilities.computeUsage` (the parent gates mounting, so the query never
 * fires elsewhere). One fetch covers 90 days; range switches re-bucket locally.
 */
export function ComputeSection() {
  const { t, i18n } = useTranslation("aiHub");
  const agents = useAgentStore((s) => s.agents);
  const [range, setRange] = useState<ComputeRange>("week");
  const { data, isLoading, isError } = useComputeUsage(true);

  const model = useMemo(
    () => bucketCompute(data?.rows ?? [], range, Date.now()),
    [data, range],
  );
  const onlineNow = data?.awakeNow ?? [];
  // Selective direct labels: every nonzero bar on the roomy 7-day view; only
  // the tallest bar on dense views (the tooltip covers the rest).
  const tallestIndex = model.buckets.findIndex(
    (bucket) => bucket.workMs > 0 && bucket.workMs === model.maxBucketMs,
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-ink">
            {t("usage.compute.title")}
          </h2>
          <p className="text-sm text-ink-muted">
            {t("usage.compute.subtitle")}
          </p>
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as ComputeRange)}>
          <TabsList>
            {RANGES.map((key) => (
              <TabsTrigger key={key} value={key}>
                {t(`usage.compute.range.${key}`)}
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
        <p className="py-6 text-sm text-ink-muted">
          {t("usage.compute.error")}
        </p>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <Empty className="mt-2">
          <EmptyTitle>{t("usage.compute.empty.title")}</EmptyTitle>
          <EmptyDescription>{t("usage.compute.empty.body")}</EmptyDescription>
        </Empty>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            {t("usage.compute.summary", {
              duration: formatDuration(t, model.totalWorkMs),
            })}
            <span aria-hidden> · </span>
            {t("usage.compute.tasks", { count: model.totalTasks })}
          </p>
          <ComputeBarChart
            buckets={model.buckets}
            max={model.maxBucketMs}
            runningNow={onlineNow.length > 0}
            barLabel={(bucket) =>
              t("usage.compute.barLabel", {
                date: dayLabel(i18n.language, bucket.startDay, {
                  month: "short",
                  day: "numeric",
                }),
                duration: formatDuration(t, bucket.workMs),
                tasks: t("usage.compute.tasks", { count: bucket.tasks }),
              })
            }
            axisLabel={(bucket) =>
              dayLabel(
                i18n.language,
                bucket.startDay,
                range === "week"
                  ? { weekday: "short" }
                  : { month: "short", day: "numeric" },
              )
            }
            valueLabel={(bucket, index) => {
              if (bucket.workMs === 0) return null;
              if (range !== "week" && index !== tallestIndex) return null;
              return formatDuration(t, bucket.workMs);
            }}
          />
          <div>
            <h3 className="mb-1 text-sm font-medium text-ink">
              {t("usage.compute.byAgent")}
            </h3>
            <ul className="flex flex-col">
              {model.perAgent.map((agent) => {
                const match = agents.find(
                  (a) =>
                    a.folderPath === agent.agentSlug ||
                    a.id === agent.agentSlug,
                );
                // A slug with no matching agent and no words in it is a
                // deleted agent's wire id — say so instead of showing hex.
                const name =
                  !match && isOpaqueSlug(agent.agentSlug)
                    ? t("usage.compute.removedAgent")
                    : agentLabel(agent.agentSlug, agents);
                return (
                  <ComputeAgentRow
                    key={agent.agentSlug}
                    agent={agent}
                    name={name}
                    color={resolveAgentColor(match?.color)}
                    max={model.maxAgentMs}
                    duration={formatDuration(t, agent.workMs)}
                    tasks={t("usage.compute.tasks", { count: agent.tasks })}
                  />
                );
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
