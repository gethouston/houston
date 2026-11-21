import {
  cn,
  HoustonAvatar,
  resolveAgentColor,
  Skeleton,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { OrgChartFaces } from "./org-chart-faces";
import { formatCount, formatWork } from "./org-chart-format";
import type { LedgerColumns, LedgerLine } from "./org-chart-view-model";

export function OrgChartPhoneLine({
  line,
  rank,
  featured,
  columns,
  onOpenBoard,
  onOpenPerson,
}: {
  line: LedgerLine;
  rank: number;
  featured: boolean;
  columns: LedgerColumns;
  onOpenBoard: (agentId: string) => void;
  onOpenPerson: (userId: string) => void;
}) {
  const { t, i18n } = useTranslation("teams");
  const work = formatWork(line.workMs, i18n.language);
  const bar = columns.bar;
  const messages = formatCount(line.messages ?? 0, i18n.language);
  const pct = line.share > 0 ? Math.max(1.5, line.share * 100) : 0;
  const people = line.people;
  const faces = people
    ? [
        ...people.manages.map((person) => ({
          person,
          relation: "manages" as const,
        })),
        ...(people.uses === "everyone" ? [] : people.uses).map((person) => ({
          person,
          relation: "uses" as const,
        })),
      ]
    : [];
  return (
    <li
      className={cn(
        "group relative flex flex-col gap-2.5",
        featured
          ? "rounded-2xl bg-card-solid p-3.5 ht-hairline shadow-edge"
          : "border-t border-line py-3",
      )}
    >
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => onOpenBoard(line.id)}
          aria-label={t("orgChart.openBoardFor", { name: line.name })}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left text-ink after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-focus"
        >
          <span className="w-3.5 shrink-0 text-xs text-ink-muted tabular-nums">
            {rank}
          </span>
          <HoustonAvatar
            color={resolveAgentColor(line.color)}
            diameter={featured ? 44 : 32}
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span
              className={cn(
                "truncate font-medium tracking-tight",
                featured ? "text-lg" : "text-base",
              )}
            >
              {line.name}
            </span>
            {line.role && (
              <span className="truncate text-xs text-ink-muted">
                {line.role}
              </span>
            )}
          </span>
        </button>
        {bar && (
          <span
            className={cn(
              "inline-flex shrink-0 items-baseline gap-1 font-light tracking-tight text-ink tabular-nums",
              featured ? "text-3xl" : "text-xl",
            )}
          >
            {bar.loading ? (
              <Skeleton className="h-5 w-10 rounded-full" />
            ) : bar.metric === "hours" ? (
              <>
                <span className="leading-none">{work.value}</span>
                <span className="text-xs text-ink-muted">
                  {t(
                    work.unit === "hours"
                      ? "orgChart.unitHours"
                      : "orgChart.unitMinutes",
                  )}
                </span>
              </>
            ) : (
              <span className="leading-none">{messages}</span>
            )}
          </span>
        )}
      </div>
      <div className="flex min-h-6 items-center justify-between gap-3 pl-6">
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {bar && (
            <span className="h-0.75 w-30 shrink-0 rounded-full bg-tab-track">
              {!bar.loading && (
                <span
                  className="block h-full rounded-full bg-ink group-has-focus-visible:bg-link"
                  style={{ width: `${pct}%` }}
                />
              )}
            </span>
          )}
          {columns.messages === "ready" && (
            <span className="shrink-0 text-xs text-ink-muted tabular-nums">
              {line.messages === null
                ? t("orgChart.notCounted")
                : t("orgChart.messagesAmount", {
                    count: line.messages,
                    value: messages,
                  })}
            </span>
          )}
        </span>
        {columns.people &&
          (people === null ? (
            <span className="text-xs text-ink-muted">
              {t("orgChart.peopleHidden")}
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-2">
              {faces.length > 0 && (
                <OrgChartFaces
                  faces={faces}
                  cut={featured ? "card" : "background"}
                  onOpenPerson={onOpenPerson}
                />
              )}
              {(people.uses === "everyone" || faces.length === 0) && (
                <span className="text-xs text-ink-muted">
                  {t(
                    people.uses === "everyone"
                      ? "orgChart.everyone"
                      : "orgChart.none",
                  )}
                </span>
              )}
            </span>
          ))}
      </div>
    </li>
  );
}
