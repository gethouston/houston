import { Spinner } from "@houston-ai/core";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { TeamCardFlow } from "./team-card-flow";
import { useSurveyRoleStart } from "./use-survey-role-start";

export function BuildTeamCard({
  workspaceId,
  onDone,
}: {
  workspaceId: string;
  onDone: () => void;
}): JSX.Element {
  const { t } = useTranslation("common");
  const survey = useSurveyRoleStart();
  if (survey.loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Spinner
          className="size-5 text-ink-muted"
          aria-label={t("actions.loading")}
        />
      </div>
    );
  }
  return (
    <TeamCardFlow
      workspaceId={workspaceId}
      start={survey.start}
      onDone={onDone}
    />
  );
}
