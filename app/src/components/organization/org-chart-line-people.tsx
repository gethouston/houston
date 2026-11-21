import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { OrgChartFaces } from "./org-chart-faces";
import { LINE, type LineSize } from "./org-chart-line-sizes";
import type { ChartPerson, ChartRelation } from "./org-chart-people";
import type { LedgerLine } from "./org-chart-view-model";

function Group({
  people,
  relation,
  size,
  className,
  onOpenPerson,
}: {
  people: readonly ChartPerson[] | "everyone";
  relation: ChartRelation;
  size: LineSize;
  className: string;
  onOpenPerson: (userId: string) => void;
}) {
  const { t } = useTranslation("teams");
  return (
    <span className={cn("flex shrink-0 items-center", className)}>
      {people === "everyone" || people.length === 0 ? (
        <span className="text-xs text-ink-muted">
          {t(people === "everyone" ? "orgChart.everyone" : "orgChart.none")}
        </span>
      ) : (
        <OrgChartFaces
          faces={people.map((person) => ({ person, relation }))}
          size={size === "featured" ? "featured" : "line"}
          cut={size === "featured" ? "card" : "background"}
          max={LINE[size].faces}
          onOpenPerson={onOpenPerson}
        />
      )}
    </span>
  );
}

export function LinePeople({
  line,
  size,
  onOpenPerson,
}: {
  line: LedgerLine;
  size: LineSize;
  onOpenPerson: (userId: string) => void;
}) {
  const { t } = useTranslation("teams");
  const s = LINE[size];
  if (line.people === null)
    return (
      <span className="flex shrink-0 items-center text-xs whitespace-nowrap text-ink-muted">
        <span className={s.manages}>{t("orgChart.peopleHidden")}</span>
        <span className={s.uses} />
      </span>
    );
  return (
    <>
      <Group
        people={line.people.manages}
        relation="manages"
        size={size}
        className={s.manages}
        onOpenPerson={onOpenPerson}
      />
      <Group
        people={line.people.uses}
        relation="uses"
        size={size}
        className={s.uses}
        onOpenPerson={onOpenPerson}
      />
    </>
  );
}
