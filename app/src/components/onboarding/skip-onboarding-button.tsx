import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/**
 * Support escape hatch pinned to the bottom of the first-run screen, on the
 * gutter below the card: a broken onboarding step must never trap the user,
 * and support can always say "click Skip onboarding". The orchestrator gates
 * it on a provisioned assistant, because completion is permanent and skipping
 * with zero agents would strand the user in an empty shell.
 */
export function SkipOnboardingButton({ onSkip }: { onSkip: () => void }) {
  const { t } = useTranslation("setup");
  return (
    <div className="absolute inset-x-0 bottom-4 flex justify-center">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-ink-muted"
        onClick={onSkip}
      >
        {t("tutorial.nav.skipOnboarding")}
      </Button>
    </div>
  );
}
