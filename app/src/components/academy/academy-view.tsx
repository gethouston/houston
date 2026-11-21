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

function AcademyLoadFailed(props: { onRetry: () => void }) {
  const { t } = useTranslation("academy");
  return (
    <Empty className="border border-line">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert className="size-6 text-danger" />
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
