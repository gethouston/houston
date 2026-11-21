import { Skeleton } from "@houston-ai/core";
import { Trans, useTranslation } from "react-i18next";
import { formatCount, formatWork } from "./org-chart-format";
import type { HeroFigures, OrgChartScope } from "./org-chart-scope";
import type { OrgChartMetric } from "./org-chart-view-model";

const CREW = {
  org: "orgChart.crew",
  yours: "orgChart.crewYours",
  personal: "orgChart.crewPersonal",
} as const satisfies Record<OrgChartScope, string>;

const ink = { strong: <span className="text-ink" /> };

function useAmounts(figures: HeroFigures) {
  const { t, i18n } = useTranslation("teams");
  const work =
    figures.workMs === null ? null : formatWork(figures.workMs, i18n.language);
  return {
    hours:
      work &&
      t(
        work.unit === "hours"
          ? "orgChart.hoursAmount"
          : "orgChart.minutesAmount",
        { count: work.count, value: work.value },
      ),
    messages:
      figures.messages === null
        ? null
        : t("orgChart.messagesAmount", {
            count: figures.messages,
            value: formatCount(figures.messages, i18n.language),
          }),
  };
}

export function HeroSentence({ figures }: { figures: HeroFigures }) {
  const { t } = useTranslation("teams");
  const { hours, messages } = useAmounts(figures);
  const agents = t("orgChart.agentCount", { count: figures.agents });
  const people =
    figures.people === null
      ? null
      : t("orgChart.peopleCount", { count: figures.people });
  const work =
    hours && messages
      ? {
          key: figures.messagesScoped
            ? "orgChart.workBothManaged"
            : "orgChart.workBoth",
          values: { hours, messages },
        }
      : hours
        ? { key: "orgChart.workHours", values: { hours } }
        : messages
          ? {
              key: figures.messagesScoped
                ? "orgChart.workMessagesManaged"
                : "orgChart.workMessages",
              values: { messages },
            }
          : null;
  return (
    <p className="text-sm leading-normal text-balance text-ink-muted tabular-nums md:text-base">
      <Trans
        t={t}
        i18nKey={CREW[figures.scope]}
        count={figures.agents}
        values={{ agents, people }}
        components={ink}
      />
      {work && " "}
      {work && (
        <Trans t={t} i18nKey={work.key} values={work.values} components={ink} />
      )}
    </p>
  );
}

export function HeroFigure({
  metric,
  loading,
  figures,
}: {
  metric: OrgChartMetric;
  loading: boolean;
  figures: HeroFigures;
}) {
  const { t, i18n } = useTranslation("teams");
  if (loading)
    return <Skeleton className="h-14 w-44 rounded-2xl md:h-20 md:w-60" />;
  const work = formatWork(figures.workMs ?? 0, i18n.language);
  const messages = figures.messages ?? 0;
  const [value, unit] =
    metric === "hours"
      ? [
          work.value,
          t(
            work.unit === "hours"
              ? "orgChart.hoursUnit"
              : "orgChart.minutesUnit",
            { count: work.count },
          ),
        ]
      : [
          formatCount(messages, i18n.language),
          t("orgChart.messagesUnit", { count: messages }),
        ];
  return (
    <span className="flex items-baseline gap-2.5 md:gap-3.5">
      <span className="text-6xl leading-none font-light tracking-tighter text-ink tabular-nums md:text-8xl">
        {value}
      </span>
      <span className="text-2xl text-ink-muted md:text-4xl">{unit}</span>
    </span>
  );
}

export function HeroStats({
  metric,
  figures,
}: {
  metric: OrgChartMetric;
  figures: HeroFigures;
}) {
  const { t, i18n } = useTranslation("teams");
  const stats = [
    metric === "hours" && figures.messages !== null
      ? {
          key: figures.messagesScoped
            ? "orgChart.statMessagesManaged"
            : "orgChart.statMessages",
          count: figures.messages,
          value: formatCount(figures.messages, i18n.language),
        }
      : null,
    { key: "orgChart.statAgents", count: figures.agents },
    figures.people === null
      ? null
      : { key: "orgChart.statPeople", count: figures.people },
  ].flatMap((stat) => (stat ? [stat] : []));
  return (
    <span className="flex flex-wrap gap-x-4.5 gap-y-1 text-sm text-ink-muted tabular-nums">
      {stats.map((stat) => (
        <span key={stat.key}>
          <Trans
            t={t}
            i18nKey={stat.key}
            count={stat.count}
            values={{ value: "value" in stat ? stat.value : stat.count }}
            components={ink}
          />
        </span>
      ))}
    </span>
  );
}
