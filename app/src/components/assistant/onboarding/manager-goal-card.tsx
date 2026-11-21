import { Button, Textarea } from "@houston-ai/core";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  isValidAutomationGoal,
  ONBOARDING_GOAL_MAX_LENGTH,
} from "../../../lib/onboarding-survey";
import {
  CARD_ACTION_CLASS,
  CARD_PRIMARY_ACTION_CLASS,
  CardActions,
} from "./card-actions";
import { ManagerStepBody, ManagerStepFrame } from "./manager-step-frame";

export function ManagerGoalCard({
  title,
  initial,
  busy,
  error,
  onAnswer,
  onDecline,
  onBack = null,
}: {
  title: string;
  initial: string;
  busy: boolean;
  error: string | null;
  onAnswer: (goal: string) => void;
  onDecline?: () => void;
  onBack?: (() => void) | null;
}) {
  const { t } = useTranslation(["assistant", "common", "setup"]);
  const [goal, setGoal] = useState(initial);
  const ready = isValidAutomationGoal(goal);
  const tooLong = [...goal.trim()].length > ONBOARDING_GOAL_MAX_LENGTH;
  const send = () => {
    if (ready && !busy) onAnswer(goal.trim());
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    send();
  };

  return (
    <ManagerStepFrame
      id="survey-goal"
      busy={busy}
      error={
        error ??
        (tooLong
          ? t("assistant:onboarding.goal.tooLong", {
              max: ONBOARDING_GOAL_MAX_LENGTH,
            })
          : null)
      }
      onBack={onBack}
      footer={
        <CardActions>
          <Button
            type="button"
            className={CARD_PRIMARY_ACTION_CLASS}
            disabled={!ready || busy}
            onClick={send}
          >
            {t("common:actions.continue")}
          </Button>
          {onDecline ? (
            <Button
              type="button"
              variant="ghost"
              className={CARD_ACTION_CLASS}
              disabled={busy}
              onClick={onDecline}
            >
              {t("setup:onboardingSurvey.completion.notNow")}
            </Button>
          ) : null}
        </CardActions>
      }
    >
      <ManagerStepBody title={title} hint={t("assistant:onboarding.goal.hint")}>
        <Textarea
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          onKeyDown={onKeyDown}
          aria-invalid={tooLong || undefined}
          rows={3}
          enterKeyHint="send"
          placeholder={t("assistant:onboarding.goal.placeholder")}
          aria-label={title}
          className="max-h-48 min-h-24 resize-none rounded-2xl px-4 py-3"
        />
      </ManagerStepBody>
    </ManagerStepFrame>
  );
}
