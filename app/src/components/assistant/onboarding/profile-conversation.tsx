import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { logAndReportError } from "../../../lib/error-report";
import {
  changeableAnswer,
  profileScript,
  type ScriptReceipt,
  type SurveyQuestion,
} from "../../../lib/manager-onboarding/script";
import { createSurveyAnalytics } from "../../onboarding/survey-analytics";
import {
  isSurveyQuestion,
  missingSurveySteps,
} from "../../onboarding/survey-steps";
import { ManagerChat } from "./manager-chat";
import { ManagerFinishCard } from "./manager-finish-card";
import type { ManagerOnboardingState } from "./manager-onboarding-context";
import { ManagerSurveyCard } from "./manager-survey-card";
import { useFinishWithTranscript } from "./use-onboarding-transcript";
import { useScriptCopy } from "./use-script-copy";

type Profile = Extract<ManagerOnboardingState, { mode: "profile_completion" }>;

export function ProfileConversation({ state }: { state: Profile }) {
  const { t } = useTranslation("assistant");
  const copy = useScriptCopy();
  const [plan] = useState(() => missingSurveySteps(state.survey));
  const [editing, setEditing] = useState<SurveyQuestion | null>(null);
  const prompted = useRef(false);
  useEffect(() => {
    if (prompted.current) return;
    prompted.current = true;
    createSurveyAnalytics("profile_completion").prompted(plan);
  }, [plan]);

  const script = profileScript({ plan, survey: state.survey.survey, editing });
  const finishing = useFinishWithTranscript(
    "profile_completion",
    script.lines,
    copy,
    state.close,
  );
  const change = (line: ScriptReceipt) => {
    if (isSurveyQuestion(line.question)) setEditing(line.question);
  };
  const changeable = changeableAnswer(script.lines);
  const notNow = () => {
    state.survey.dismissCompletionPrompt().catch((err: unknown) => {
      logAndReportError("onboarding_survey_dismiss", err);
    });
    state.close();
  };

  let prompt: ReactNode = null;
  if (script.prompt.kind === "survey")
    prompt = (
      <ManagerSurveyCard
        mode="profile_completion"
        question={script.prompt.question}
        survey={state.survey}
        copy={copy}
        onAnswered={() => setEditing(null)}
        onDecline={notNow}
        onBack={changeable ? () => change(changeable) : null}
      />
    );
  if (script.prompt.kind === "finish")
    prompt = (
      <ManagerFinishCard
        action={t("onboarding.finish.profileAction")}
        saving={finishing.saving}
        onDone={finishing.done}
      />
    );

  return (
    <ManagerChat
      lines={script.lines}
      copy={copy}
      prompt={prompt}
      onChange={change}
    />
  );
}
