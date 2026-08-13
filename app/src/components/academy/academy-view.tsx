import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@houston-ai/core";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAcademyProgress } from "../../hooks/use-academy-progress";
import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { PageContainer } from "../shell/page-shell";
import { ACADEMY_HEADER_THRESHOLDS, AcademyHeader } from "./academy-header";
import { AcademyPath } from "./academy-path";
import { AcademyStatusHeader } from "./academy-status-header";
import { useAcademyOpened } from "./use-academy-opened";

/**
 * Houston Academy: learning the product as a climb rather than a manual.
 *
 * A TOP-LEVEL view for everyone, under About me. It is ungated on purpose:
 * learning the product is not a preference and belongs to nobody's admin
 * territory, so it is a row of its own and owns the whole window, with no back
 * bar because there is no level above it.
 *
 * It wears the app's page strip, the same fixed 48px band Skills, Integrations,
 * the Agent Store and Admin wear, so the screen's name sits where a user has
 * already learned to read it. The strip owns the h1, which is why nothing below
 * it is a second page title.
 *
 * Two halves under the strip. The status header says where the user stands, with
 * their own face inside the rank ring. The path below says what to do next: the
 * guided setup, then the stops that are still to come. Both read the ONE stored
 * record (`useAcademyProgress()`), so the rank and the path can never tell the
 * user two different stories about the same chapter.
 *
 * A record that failed to LOAD takes the whole page instead of either half. An
 * unread record is indistinguishable from an empty one, so drawing the halves
 * would hand a Mission Director the rank of a fresh cadet and offer "Start" on
 * a chapter they finished months ago. Saying so, with a retry, is the only
 * honest screen.
 */
export function AcademyView() {
  const progress = useAcademyProgress();
  useAcademyOpened();

  return (
    <PageHeaderToolsProvider thresholds={ACADEMY_HEADER_THRESHOLDS}>
      <div className="flex h-full flex-col">
        <AcademyHeader />
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <PageContainer className="flex flex-col gap-8 pt-6 pb-10">
            {progress.isError ? (
              <AcademyLoadFailed onRetry={progress.retry} />
            ) : (
              <>
                <AcademyStatusHeader
                  rank={progress.rank}
                  experience={progress.experience}
                  usagePoints={progress.usagePoints}
                  streak={progress.streak}
                  loading={progress.loading}
                />
                <AcademyPath
                  record={progress.record}
                  loading={progress.loading}
                />
              </>
            )}
          </PageContainer>
        </div>
      </div>
    </PageHeaderToolsProvider>
  );
}

/**
 * The whole page when the record could not be read. The house failure shape
 * (`Empty` + the warning glyph + one retry), and no numbers at all: a rank or
 * a chapter state invented from a failed read is worse than an empty screen.
 */
function AcademyLoadFailed(props: { onRetry: () => void }) {
  const { t } = useTranslation("academy");
  return (
    <Empty className="border border-line">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert className="size-6 text-destructive" />
        </EmptyMedia>
        <EmptyTitle>{t("error.title")}</EmptyTitle>
        <EmptyDescription>{t("error.description")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" onClick={props.onRetry}>
          {t("error.retry")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
