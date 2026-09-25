import { Spinner } from "@houston-ai/core";
import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { FirstRunScreen } from "../first-run-screen";
import { SetupCard } from "../setup-card";
import { TeamCardFlow } from "./team-card-flow";
import { useSurveyRoleStart } from "./use-survey-role-start";
import type { TeamCardMode } from "./use-team-navigation";

/**
 * "Build your team": the moment a workspace gets its first AI Employees,
 * either hired one at a time through the in-app hire (industry, job, name) or
 * as a ready-made team of three. The industry the person gave in the survey
 * is already answered on both paths.
 *
 * `first_run` is a full screen of the first-run flow, on its setup card.
 * `new_workspace` is the card's content alone, for the dialog that has just
 * created the workspace, which owns the frame (and the way out) around it.
 *
 * Hires land in `workspaceId` with their first day pending: this card builds
 * the team and hands over with `onDone`; nobody starts working from here.
 */
export function BuildTeamCard(props: {
  workspaceId: string;
  mode: "first_run" | "new_workspace";
  onDone: () => void;
}): JSX.Element {
  const content = <TeamCardContent {...props} />;
  if (props.mode === "new_workspace") return content;
  return (
    <FirstRunScreen>
      <SetupCard layout="team">{content}</SetupCard>
    </FirstRunScreen>
  );
}

function TeamCardContent({
  workspaceId,
  mode,
  onDone,
}: {
  workspaceId: string;
  mode: TeamCardMode;
  onDone: () => void;
}) {
  const { t } = useTranslation("common");
  const survey = useSurveyRoleStart();
  // The industry question takes its opening answer once, when it mounts, so
  // the flow waits for the survey record rather than opening blank on it.
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
      mode={mode}
      start={survey.start}
      onDone={onDone}
    />
  );
}
