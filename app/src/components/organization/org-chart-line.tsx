import { cn, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { CAPTION } from "./org-chart-caption";
import { LineBar, LineMessages } from "./org-chart-line-parts";
import { LinePeople } from "./org-chart-line-people";
import { LINE, type LineSize } from "./org-chart-line-sizes";
import type { LedgerColumns, LedgerLine } from "./org-chart-view-model";

const SHELL: Record<LineSize, string> = {
  featured:
    "rounded-2xl bg-card-solid px-4 py-5 ht-hairline shadow-edge transition-transform duration-200 ease-out hover:-translate-y-px hover:ring-1 hover:ring-link/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
  line: "h-19 border-t border-line px-4 hover:bg-hover",
  dense: "h-14 border-t border-line px-2 hover:bg-hover",
};

export function OrgChartLine({
  line,
  rank,
  size,
  columns,
  onOpenBoard,
  onOpenPerson,
}: {
  line: LedgerLine;
  rank: number;
  size: LineSize;
  columns: LedgerColumns;
  onOpenBoard: (agentId: string) => void;
  onOpenPerson: (userId: string) => void;
}) {
  const { t } = useTranslation("teams");
  const s = LINE[size];
  return (
    <li
      className={cn(
        "group relative flex items-center gap-x-5",
        size === "dense" && "gap-x-3",
        SHELL[size],
      )}
    >
      <button
        type="button"
        onClick={() => onOpenBoard(line.id)}
        aria-label={t("orgChart.openBoardFor", { name: line.name })}
        className={cn(
          "flex min-w-0 items-center text-left text-ink",
          "after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-focus",
          s.agent,
        )}
      >
        <span className={cn("shrink-0 text-ink-muted tabular-nums", s.rank)}>
          {rank}
        </span>
        <HoustonAvatar
          color={resolveAgentColor(line.color)}
          diameter={s.avatar}
        />
        <span
          className={cn(
            "flex min-w-0 flex-col",
            size === "dense" ? "gap-0.5 pl-1" : "gap-1 pl-1.5",
          )}
        >
          <span
            className={cn(
              "truncate leading-tight font-medium tracking-tight",
              s.name,
            )}
          >
            {line.name}
          </span>
          {line.role && (
            <span
              className={cn("truncate leading-tight text-ink-muted", s.role)}
            >
              {line.role}
            </span>
          )}
        </span>
      </button>
      {columns.bar && (
        <LineBar
          line={line}
          metric={columns.bar.metric}
          loading={columns.bar.loading}
          size={size}
        />
      )}
      {columns.messages && (
        <LineMessages
          line={line}
          loading={columns.messages === "loading"}
          size={size}
        />
      )}
      {columns.people && (
        <LinePeople line={line} size={size} onOpenPerson={onOpenPerson} />
      )}
    </li>
  );
}

export function OrgChartLineHeader({
  size,
  columns,
  className,
}: {
  size: Exclude<LineSize, "featured">;
  columns: LedgerColumns;
  className?: string;
}) {
  const { t } = useTranslation("teams");
  const s = LINE[size];
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex items-end gap-x-5 pb-3",
        size === "dense" ? "gap-x-3 px-2" : "px-4",
        CAPTION,
        className,
      )}
    >
      <span className={cn("flex min-w-0", s.agent, "gap-0")}>
        <span className={cn("shrink-0", s.rankWidth)}>#</span>
        <span className={cn("truncate", s.indent)}>
          {t("orgChart.colAgent")}
        </span>
      </span>
      {columns.bar && (
        <span className={cn("truncate", s.barCell)}>
          {t(
            columns.bar.metric === "hours"
              ? "orgChart.colHours"
              : "orgChart.colMessages",
          )}
        </span>
      )}
      {columns.messages && (
        <span className={cn("shrink-0 text-right", s.messagesWidth)}>
          {t("orgChart.colMessages")}
        </span>
      )}
      {columns.people && (
        <>
          <span className={cn("shrink-0", s.manages)}>
            {t("orgChart.manages")}
          </span>
          <span className={cn("shrink-0", s.uses)}>{t("orgChart.uses")}</span>
        </>
      )}
    </div>
  );
}
