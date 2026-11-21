import { cn } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { PersonFace } from "../mission-person-face";
import type { ChartPerson, ChartRelation } from "./org-chart-people";

function RelationDot({
  relation,
  className,
}: {
  relation: ChartRelation;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-1.75 shrink-0 rounded-full",
        relation === "manages"
          ? "bg-ink"
          : "border border-ink-muted bg-background",
        className,
      )}
    />
  );
}

const FACE = {
  line: "size-6",
  featured: "size-7",
} as const;

export interface ChartFace {
  person: ChartPerson;
  relation: ChartRelation;
}

export function OrgChartFaces({
  faces,
  size = "line",
  cut = "background",
  max = 4,
  onOpenPerson,
}: {
  faces: readonly ChartFace[];
  size?: keyof typeof FACE;
  cut?: "background" | "card";
  max?: number;
  onOpenPerson: (userId: string) => void;
}) {
  const { t } = useTranslation("teams");
  const ring = cut === "card" ? "ring-card-solid" : "ring-background";
  const shown = faces.slice(0, max);
  const more = faces.length - shown.length;
  return (
    <span className="relative z-10 inline-flex items-center">
      {shown.map(({ person, relation }) => (
        <button
          key={person.userId}
          type="button"
          onClick={() => onOpenPerson(person.userId)}
          aria-label={t("orgChart.openPerson", { name: person.name })}
          className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full before:absolute before:inset-x-0 before:-inset-y-2.5 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
        >
          <PersonFace
            person={{
              id: person.userId,
              label: person.name,
              imageUrl: person.imageUrl,
            }}
            className={cn(FACE[size], "shrink-0 ring-2", ring)}
          />
          <RelationDot
            relation={relation}
            className={cn(
              "absolute -right-px -bottom-px ring-2",
              ring,
              cut === "card" && relation === "uses" && "bg-card-solid",
            )}
          />
        </button>
      ))}
      {more > 0 && (
        <span className="ml-1.5 text-xs text-ink-muted tabular-nums">
          {t("orgChart.more", { count: more })}
        </span>
      )}
    </span>
  );
}

export function OrgChartRelationKey({ className }: { className?: string }) {
  const { t } = useTranslation("teams");
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted",
        className,
      )}
    >
      {(["manages", "uses"] as const).map((relation) => (
        <span key={relation} className="inline-flex items-center gap-1.5">
          <RelationDot relation={relation} />
          <span className="md:hidden">
            {t(relation === "manages" ? "orgChart.manages" : "orgChart.uses")}
          </span>
          <span className="hidden md:inline">
            {t(
              relation === "manages"
                ? "orgChart.legendManages"
                : "orgChart.legendUses",
            )}
          </span>
        </span>
      ))}
    </div>
  );
}
