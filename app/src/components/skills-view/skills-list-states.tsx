import {
  Button,
  CatalogGrid,
  cn,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
} from "@houston-ai/core";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HeaderToolsRow } from "../shell/page-header/header-tools-row";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";
import type { SkillsListState } from "./skills-list-model";

/**
 * The states the Skills library owes beside its rows: nothing created yet, a
 * search that matched nothing, the read that did not answer, and the wait
 * before any of them is known.
 *
 * The failure state carries a retry and NO error text of its own: the engine
 * call already toasted and reported it (`lib/tauri`'s `call`), so repeating the
 * report here would double-count one failure, and a raw message is not copy.
 */

/** How many rows the skeleton lays out — enough to read as a list without
 *  promising more than the preview cap ever shows at rest. */
const SKELETON_ROWS = ["a", "b", "c", "d"] as const;

/** One row's exact geometry: the same leading art, gaps and vertical padding
 *  `CatalogRow` paints, so the real rows land where the skeleton stood. */
function SkeletonRow() {
  return (
    <div className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5">
      <Skeleton className="size-10 shrink-0 rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

/** The search field and the create button at rest, in whichever of the two
 *  forms `SkillsControls` takes: compact in the strip, full width in the body
 *  row. Same container, same heights, so nothing moves when they land. */
function SkeletonControls({ inStrip }: { inStrip: boolean }) {
  const height = inStrip ? "h-8" : "h-9";
  return (
    <HeaderToolsRow
      inStrip={inStrip}
      search={<Skeleton className={cn(height, "w-full rounded-full")} />}
    >
      <Skeleton className={cn(height, "w-32 rounded-full")} />
    </HeaderToolsRow>
  );
}

export function SkillsListSkeleton() {
  const { t } = useTranslation("skills");
  return (
    <div role="status" aria-label={t("grid.loading")}>
      {/* The controls own the strip on a wide header and the body below its
          one-row threshold; reserving the wrong one is the shift itself. */}
      <PageHeaderTools>
        {(inStrip) => <SkeletonControls inStrip={inStrip} />}
      </PageHeaderTools>
      <Skeleton className="mb-4 h-5 w-28" />
      <CatalogGrid>
        {SKELETON_ROWS.map((id) => (
          <SkeletonRow key={id} />
        ))}
      </CatalogGrid>
    </div>
  );
}

/** The library list with no rows to show, in whichever of its two senses. */
export function SkillsListEmpty({
  state,
  query,
}: {
  state: Exclude<SkillsListState, "rows">;
  query: string;
}) {
  const { t } = useTranslation("skills");
  const noSkills = state === "no-skills";
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>
          {noSkills
            ? t("grid.emptyTitle")
            : t("grid.noMatchesTitle", { query: query.trim() })}
        </EmptyTitle>
        <EmptyDescription>
          {noSkills
            ? t("grid.emptyDescription", { action: t("global.createSkill") })
            : t("grid.noMatchesDescription")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** A read that did not answer, said once with the way to try it again. Shared
 *  by the library list and the editor's body, which fail the same way. */
export function SkillsRetryEmpty({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  const { t } = useTranslation("skills");
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <Button type="button" variant="outline" onClick={onRetry}>
        <RefreshCw className="size-4" />
        {t("global.retry")}
      </Button>
    </Empty>
  );
}
