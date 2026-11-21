import { Button } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  CARD_ACTION_CLASS,
  CARD_PRIMARY_ACTION_CLASS,
  CardActions,
} from "./card-actions";
import { ManagerStepFrame } from "./manager-step-frame";

export function ManagerQuestionStep({
  id,
  busy = false,
  error,
  onContinue,
  onDecline,
  onBack = null,
  children,
}: {
  id: string;
  busy?: boolean;
  error?: string | null;
  onContinue: (() => void) | null;
  onDecline?: () => void;
  onBack?: (() => void) | null;
  children: ReactNode;
}) {
  const { t } = useTranslation(["common", "setup"]);
  const footer =
    onContinue || onDecline ? (
      <CardActions>
        {onContinue ? (
          <Button
            type="button"
            className={CARD_PRIMARY_ACTION_CLASS}
            disabled={busy}
            onClick={onContinue}
          >
            {t("common:actions.continue")}
          </Button>
        ) : null}
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
    ) : undefined;

  return (
    <ManagerStepFrame
      id={id}
      busy={busy}
      error={error}
      footer={footer}
      onBack={onBack}
    >
      {children}
    </ManagerStepFrame>
  );
}
