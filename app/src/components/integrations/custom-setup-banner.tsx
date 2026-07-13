import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";

/**
 * The Continue-setup banner: a draft custom-integration setup chat exists but
 * its panel is closed, so invite the user back into it (or let them finish /
 * discard it). Always-visible buttons, never a hover-only affordance.
 */
export function CustomSetupBanner({
  onDiscard,
  onDone,
  onContinue,
}: {
  onDiscard: () => void;
  onDone: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation("integrations");
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl bg-chip px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          {t("custom.setupChat.bannerTitle")}
        </p>
        <p className="text-xs text-ink/70">
          {t("custom.setupChat.bannerDescription")}
        </p>
      </div>
      <Button variant="ghost" onClick={onDiscard}>
        {t("custom.setupChat.discard")}
      </Button>
      <Button variant="outline" onClick={onDone}>
        {t("custom.setupChat.done")}
      </Button>
      <Button onClick={onContinue}>{t("custom.setupChat.continue")}</Button>
    </div>
  );
}
