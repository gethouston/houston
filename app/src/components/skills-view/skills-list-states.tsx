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

const SKELETON_ROWS = ["a", "b", "c", "d"] as const;

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
