import { Button, ConfirmDialog } from "@houston-ai/core";
import { RefreshCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOnboardingSegment } from "../../../hooks/use-onboarding-segment";
import { useUIStore } from "../../../stores/ui";
import { SettingsControlRow } from "../settings-row";

export function OnboardingSegmentResetSection() {
  const { t } = useTranslation("settings");
  const addToast = useUIStore((s) => s.addToast);
  const onboardingSegment = useOnboardingSegment(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleResetSegment = async () => {
    if (resetting || onboardingSegment.isClearing) return;
    setResetting(true);
    try {
      await onboardingSegment.clearSegment();
      addToast({ title: t("onboardingSegmentReset.toast") });
    } catch {
      // `clearSegment` routes through `call()`, which already surfaced the
      // failure to the user with the real engine message and bug-report action.
    } finally {
      setResetting(false);
      setResetOpen(false);
    }
  };

  return (
    <>
      <SettingsControlRow
        icon={RefreshCcw}
        title={t("onboardingSegmentReset.title")}
        description={t("onboardingSegmentReset.description")}
      >
        <Button
          variant="outline"
          size="sm"
          disabled={resetting || onboardingSegment.isClearing}
          onClick={() => setResetOpen(true)}
        >
          {t("onboardingSegmentReset.button")}
        </Button>
      </SettingsControlRow>

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title={t("onboardingSegmentReset.confirmTitle")}
        description={t("onboardingSegmentReset.confirmDescription")}
        confirmLabel={t("onboardingSegmentReset.confirmLabel")}
        cancelLabel={t("common:actions.cancel")}
        onConfirm={() => void handleResetSegment()}
      />
    </>
  );
}
