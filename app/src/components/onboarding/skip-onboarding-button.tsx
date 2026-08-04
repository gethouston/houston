import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/**
 * Support escape hatch pinned to the bottom of the first-run screen, on the
 * gutter below the card: a broken onboarding step must never trap the user,
 * and support can always say "click Skip onboarding". Shown from the first
 * step onward — a zero-agent skip lands on the shell's empty state, whose
 * "New agent" CTA is the recovery path.
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
