import { Skeleton } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useRunGuidedSetup } from "../../hooks/use-run-guided-setup";
import { SETUP_CHAPTER_ID } from "../../lib/academy/academy-ranks";
import type { AcademyRecord } from "../../lib/academy/academy-record";
import { AcademyChapterNode } from "./academy-chapter-node";

/** How many "coming soon" stops stand after the chapters that exist. */
const PLACEHOLDER_NODES = [0, 1];

/**
 * The path: the chapters in the order they are walked.
 *
 * A plain vertical list on purpose. The finished path gets its own art, and
 * building that art before there is more than one real chapter would be
 * decoration standing in for content. What ships is honest: the one chapter
 * that exists, its true state read from the stored record, and the stops after
 * it drawn as locked so the shape of the climb is visible without pretending
 * those chapters are ready.
 *
 * The record is skeletoned rather than assumed while it loads: an unread record
 * looks exactly like an untouched one, so drawing it would offer "Start" to
 * someone who finished the chapter months ago and then swap the button under
 * their cursor.
 */
export function AcademyPath(props: {
  record: AcademyRecord | null;
  loading: boolean;
}) {
  const { t } = useTranslation("academy");
  const runGuidedSetup = useRunGuidedSetup();
  const setup = props.record?.chapters[SETUP_CHAPTER_ID];
  const completed = setup !== undefined;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-ink">{t("path.title")}</h2>
      <ol className="flex flex-col">
        {props.loading ? (
          <AcademyChapterSkeleton />
        ) : (
          <AcademyChapterNode
            state={completed ? "completed" : "available"}
            title={t("chapters.setup.title")}
            description={t("chapters.setup.description")}
            earnedLabel={
              setup ? t("path.earned", { points: setup.experience }) : undefined
            }
            action={{
              label: completed ? t("actions.replay") : t("actions.start"),
              onClick: runGuidedSetup,
            }}
          />
        )}
        {PLACEHOLDER_NODES.map((index) => (
          <AcademyChapterNode
            key={index}
            state="locked"
            title={t("locked.title")}
            description={t("locked.description")}
            last={index === PLACEHOLDER_NODES.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}

/** The first node's shape while the record is in flight, so nothing shifts. */
function AcademyChapterSkeleton() {
  return (
    <li className="flex items-center gap-4 py-3 pl-1">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
    </li>
  );
}
