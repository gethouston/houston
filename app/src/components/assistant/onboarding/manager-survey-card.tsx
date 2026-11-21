import { useEffect, useMemo, useState } from "react";
import type { OnboardingSurveyState } from "../../../hooks/use-onboarding-survey";
import { genericErrorDescription } from "../../../lib/error-report";
import type { SurveyQuestion } from "../../../lib/manager-onboarding/script";
import {
  surveyIndustryContext,
  surveyLeadershipRole,
  surveyRoleContext,
} from "../../../lib/onboarding-industry-context";
import {
  isOnboardingCompanySize,
  ONBOARDING_INDUSTRY_SOMETHING_ELSE,
  ONBOARDING_ROLE_SOMETHING_ELSE,
} from "../../../lib/onboarding-survey";
import { createSurveyAnalytics } from "../../onboarding/survey-analytics";
import type { OnboardingSurveyMode } from "../../onboarding/survey-steps";
import { surveyRoleStart } from "../../onboarding/team/team-industry";
import { ManagerAboutStep } from "./manager-about-step";
import { ManagerCompanySizeCard } from "./manager-company-size-card";
import { ManagerGoalCard } from "./manager-goal-card";
import type { ScriptCopy } from "./use-script-copy";

export function ManagerSurveyCard({
  mode,
  question,
  survey,
  copy,
  onAnswered,
  onDecline,
  onBack = null,
}: {
  mode: OnboardingSurveyMode;
  question: SurveyQuestion;
  survey: OnboardingSurveyState;
  copy: ScriptCopy;
  onAnswered: (question: SurveyQuestion) => void;
  onDecline?: () => void;
  onBack?: (() => void) | null;
}) {
  const track = useMemo(() => createSurveyAnalytics(mode), [mode]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track.stepViewed(question);
  }, [question, track]);

  const save = async (write: () => Promise<void>) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await write();
      onAnswered(question);
    } catch (err) {
      setError(genericErrorDescription("save_onboarding_survey", err));
    } finally {
      setSaving(false);
    }
  };

  const record = survey.survey;
  if (question === "goal")
    return (
      <ManagerGoalCard
        title={copy.question("goal") ?? ""}
        initial={record?.automationGoal ?? ""}
        busy={saving}
        error={error}
        onDecline={onDecline}
        onBack={onBack}
        onAnswer={(goal) =>
          void save(async () => {
            await survey.saveGoal(goal);
            track.goalContinued(goal);
          })
        }
      />
    );

  const heldSize = record?.companySize ?? null;
  if (question === "companySize")
    return (
      <ManagerCompanySizeCard
        title={copy.question("companySize") ?? ""}
        held={isOnboardingCompanySize(heldSize) ? heldSize : null}
        busy={saving}
        error={error}
        onDecline={onDecline}
        onBack={onBack}
        onAnswer={(size) =>
          void save(async () => {
            await survey.saveCompanySize(size);
            track.companySizeContinued(size);
          })
        }
      />
    );

  return (
    <ManagerAboutStep
      key={question}
      question={question}
      start={surveyRoleStart(
        surveyIndustryContext(record),
        surveyRoleContext(record),
      )}
      leadershipStart={surveyLeadershipRole(record)}
      busy={saving}
      error={error}
      onDecline={onDecline}
      onBack={onBack}
      onIndustry={(answer) => {
        const id =
          answer.kind === "catalog"
            ? answer.id
            : ONBOARDING_INDUSTRY_SOMETHING_ELSE;
        const other = answer.kind === "custom" ? answer.label : null;
        track.industrySelected(id);
        void save(async () => {
          await survey.saveIndustry(id, other);
          track.industryContinued(id);
        });
      }}
      onRole={(answer) => {
        const id =
          answer.kind === "catalog"
            ? answer.id
            : ONBOARDING_ROLE_SOMETHING_ELSE;
        const other = answer.kind === "custom" ? answer.label : null;
        track.roleSelected(id);
        void save(async () => {
          await survey.saveRole(id, other);
          track.roleContinued(id);
        });
      }}
    />
  );
}
