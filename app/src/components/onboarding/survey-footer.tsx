import { Button } from "@houston-ai/core";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The survey's action row: Back (from the second question on) beside the
 * per-step Continue, with the in-app prompt's "Not now" underneath. Each
 * `null` handler is an action this step does not offer.
 *
 * No question carries its own skip. A per-question link sat one reflex click
 * away from the answer we were asking for, and got taken without a decision;
 * the deliberate exits are the global "Skip onboarding" escape hatch below the
 * card and "Not now" here on the in-app prompt.
 */
export function SurveyFooter({
  saving,
  canContinue,
  onBack,
  onContinue,
  onDismiss,
}: {
  saving: boolean;
  canContinue: boolean;
  onBack: (() => void) | null;
  onContinue: () => void;
  onDismiss: (() => void) | null;
}) {
  const { t } = useTranslation(["setup", "common"]);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-3">
        {onBack && (
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="rounded-full"
            onClick={onBack}
            disabled={saving}
          >
            {t("common:actions.back")}
          </Button>
        )}
        <Button
          type="button"
          size="lg"
          className="min-w-48 rounded-full"
          onClick={onContinue}
          disabled={!canContinue || saving}
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          {t("common:actions.continue")}
        </Button>
      </div>
      {onDismiss && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-ink-muted"
          onClick={onDismiss}
          disabled={saving}
        >
          {t("setup:onboardingSurvey.completion.notNow")}
        </Button>
      )}
    </div>
  );
}
