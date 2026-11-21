import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  isOnboardingCompanySize,
  ONBOARDING_COMPANY_SIZE_IDS,
  type OnboardingCompanySize,
} from "../../../lib/onboarding-survey";
import { ChoiceChips } from "../../shell/choice-chips";
import { useChipGrid } from "../../shell/use-choice-keyboard";
import { CARD_ACTION_CLASS, CardActions } from "./card-actions";
import { ManagerStepBody, ManagerStepFrame } from "./manager-step-frame";

export function ManagerCompanySizeCard({
  title,
  held,
  busy,
  error,
  onAnswer,
  onDecline,
  onBack = null,
}: {
  title: string;
  held: OnboardingCompanySize | null;
  busy: boolean;
  error: string | null;
  onAnswer: (size: OnboardingCompanySize) => void;
  onDecline?: () => void;
  onBack?: (() => void) | null;
}) {
  const { t } = useTranslation(["assistant", "setup"]);
  const grid = useChipGrid();
  const options = ONBOARDING_COMPANY_SIZE_IDS.map((id) => ({
    id,
    label: t(`assistant:onboarding.companySize.${id}`),
  }));
  return (
    <ManagerStepFrame
      id="survey-companySize"
      busy={busy}
      error={error}
      onBack={onBack}
      footer={
        onDecline ? (
          <CardActions>
            <Button
              type="button"
              variant="ghost"
              className={CARD_ACTION_CLASS}
              disabled={busy}
              onClick={onDecline}
            >
              {t("setup:onboardingSurvey.completion.notNow")}
            </Button>
          </CardActions>
        ) : undefined
      }
    >
      <ManagerStepBody title={title}>
        <div ref={grid.ref} role="radiogroup" aria-label={title}>
          <ChoiceChips
            options={options}
            selectedId={held}
            rovingId={held ?? options[0].id}
            onKeyDown={grid.onKeyDown}
            onSelect={(id) => {
              if (isOnboardingCompanySize(id)) onAnswer(id);
            }}
          />
        </div>
      </ManagerStepBody>
    </ManagerStepFrame>
  );
}
