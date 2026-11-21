import { cn, Skeleton } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { formatCount, formatWork } from "./org-chart-format";
import { LINE, type LineSize } from "./org-chart-line-sizes";
import type { LedgerLine, OrgChartMetric } from "./org-chart-view-model";

function Figure({
  value,
  unit,
  unitClass,
}: {
  value: string;
  unit?: string;
  unitClass?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="leading-none font-light tracking-tight text-ink tabular-nums">
        {value}
      </span>
      {unit && <span className={cn("text-ink-muted", unitClass)}>{unit}</span>}
    </span>
  );
}

export function LineBar({
  line,
  metric,
  loading,
  size,
}: {
  line: LedgerLine;
  metric: OrgChartMetric;
  loading: boolean;
  size: LineSize;
}) {
  const { t, i18n } = useTranslation("teams");
  const s = LINE[size];
  const work = formatWork(line.workMs, i18n.language);
  const pct = line.share > 0 ? Math.max(1.5, line.share * 100) : 0;
  return (
    <span className={cn("flex items-center", s.barCell)}>
      <span className={cn("min-w-0 flex-1 rounded-full bg-tab-track", s.bar)}>
        {!loading && (
          <span
            className="block h-full rounded-full bg-ink group-hover:bg-link group-has-focus-visible:bg-link"
            style={{ width: `${pct}%` }}
          />
        )}
      </span>
      <span className={cn("shrink-0", s.figure)}>
        {loading ? (
          <Skeleton className={cn("rounded-full", s.figureSkeleton)} />
        ) : metric === "hours" ? (
          <Figure
            value={work.value}
            unitClass={s.unit}
            unit={t(
              work.unit === "hours"
                ? "orgChart.unitHours"
                : "orgChart.unitMinutes",
            )}
          />
        ) : (
          <Figure value={formatCount(line.messages ?? 0, i18n.language)} />
        )}
      </span>
    </span>
  );
}

export function LineMessages({
  line,
  loading,
  size,
}: {
  line: LedgerLine;
  loading: boolean;
  size: LineSize;
}) {
  const { t, i18n } = useTranslation("teams");
  const s = LINE[size];
  if (!loading && line.messages === null)
    return (
      <span
        className={cn(
          "flex shrink-0 justify-end text-xs whitespace-nowrap text-ink-muted",
          s.messagesWidth,
        )}
      >
        {t("orgChart.notCounted")}
      </span>
    );
  const count = line.messages ?? 0;
  return (
    <span
      className={cn(
        "flex shrink-0 flex-col items-end gap-1 leading-none font-light tracking-tight text-ink tabular-nums",
        s.messages,
      )}
    >
      {loading ? (
        <Skeleton className={cn("rounded-full", s.messagesSkeleton)} />
      ) : (
        formatCount(count, i18n.language)
      )}
      {size === "featured" && !loading && (
        <span className="text-xs font-normal tracking-normal text-ink-muted">
          {t("orgChart.messagesUnit", { count })}
        </span>
      )}
    </span>
  );
}
