import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { CAPTION } from "./org-chart-caption";
import { OrgChartRelationKey } from "./org-chart-faces";
import { OrgChartLine, OrgChartLineHeader } from "./org-chart-line";
import { OrgChartPhoneLine } from "./org-chart-phone-line";
import { OrgChartLedgerSkeleton } from "./org-chart-skeleton";
import {
  DENSE_LEDGER,
  type LedgerColumns,
  type LedgerLine,
} from "./org-chart-view-model";

const RANKED_BY = {
  hours: "orgChart.rankedByHours",
  messages: "orgChart.rankedByMessages",
  none: "orgChart.rankedByName",
} as const;

interface LedgerProps {
  lines: readonly LedgerLine[];
  columns: LedgerColumns;
  phone: boolean;
  onOpenBoard: (agentId: string) => void;
  onOpenPerson: (userId: string) => void;
}

export function OrgChartLedger(props: LedgerProps) {
  const { t } = useTranslation("teams");
  const { lines, columns, phone } = props;
  if (columns.bar?.loading)
    return <OrgChartLedgerSkeleton label={t("orgChart.loading")} />;
  const [first, ...rest] = lines;
  const dense = lines.length > DENSE_LEDGER;
  const half = Math.ceil(rest.length / 2);
  const runs = dense ? [rest.slice(0, half), rest.slice(half)] : [rest];
  const line = (entry: LedgerLine, rank: number) =>
    phone ? (
      <OrgChartPhoneLine
        key={entry.id}
        line={entry}
        rank={rank}
        featured={rank === 1}
        columns={columns}
        onOpenBoard={props.onOpenBoard}
        onOpenPerson={props.onOpenPerson}
      />
    ) : (
      <OrgChartLine
        key={entry.id}
        line={entry}
        rank={rank}
        size={rank === 1 ? "featured" : dense ? "dense" : "line"}
        columns={columns}
        onOpenBoard={props.onOpenBoard}
        onOpenPerson={props.onOpenPerson}
      />
    );
  if (!first) return null;
  return (
    <section aria-label={t("orgChart.ledgerLabel")} className="flex flex-col">
      <div className="mb-3 flex items-center justify-between gap-4 md:mb-4">
        <span className={CAPTION}>
          {t(RANKED_BY[columns.bar?.metric ?? "none"])}
        </span>
        {columns.people && <OrgChartRelationKey />}
      </div>
      <ol className="flex flex-col">{line(first, 1)}</ol>
      {rest.length > 0 && (
        <div className="@container mt-2 md:mt-7">
          <div
            className={cn(
              "grid grid-cols-1",
              dense && "gap-x-12 @7xl:grid-cols-2",
            )}
          >
            {runs.map((run, index) => {
              const start = 2 + (index === 0 ? 0 : half);
              return (
                <div key={start} className="flex min-w-0 flex-col">
                  {!phone && (
                    <OrgChartLineHeader
                      size={dense ? "dense" : "line"}
                      columns={columns}
                      className={cn(index > 0 && "hidden @7xl:flex")}
                    />
                  )}
                  <ol start={start} className="flex flex-col">
                    {run.map((entry, offset) => line(entry, start + offset))}
                  </ol>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
