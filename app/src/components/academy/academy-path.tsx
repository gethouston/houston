import { Skeleton } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import type { AcademyRecord } from "../../lib/academy/academy-record";
import { AcademyChapterSection } from "./academy-chapter-section";
import { AcademyPathNode } from "./academy-path-node";
import { academyChapterPaths } from "./academy-path-state";
import { availableLessons } from "./lessons/lesson-availability";
import { ACADEMY_LESSONS } from "./lessons/registry";

const PLACEHOLDER_NODES = [0, 1];

export function AcademyPath(props: {
  record: AcademyRecord | null;
  loading: boolean;
}) {
  const { t } = useTranslation("academy");
  const { capabilities, isLoading } = useCapabilities();
  const lessons = availableLessons(
    Object.values(ACADEMY_LESSONS),
    capabilities,
  );

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-ink">{t("path.title")}</h2>
      <div className="flex flex-col gap-4">
        {props.loading || isLoading ? (
          <AcademyPathSkeleton />
        ) : (
          academyChapterPaths(props.record, lessons).map((chapter) => (
            <AcademyChapterSection key={chapter.id} chapter={chapter} />
          ))
        )}
        <ol className="flex flex-col">
          {PLACEHOLDER_NODES.map((index) => (
            <AcademyPathNode
              key={index}
              state="locked"
              title={t("locked.title")}
              description={t("locked.description")}
              last={index === PLACEHOLDER_NODES.length - 1}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

function AcademyPathSkeleton() {
  return (
    <div className="flex items-center gap-4 py-3 pl-1">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
    </div>
  );
}
