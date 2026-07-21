import { AsyncButton } from "@houston-ai/core";
import { Clock, RefreshCw, Sparkles, UploadCloud } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LegacyDetection } from "../../../lib/cloud-migration";
import { HoustonLogo } from "../../shell/experience-card";
import { WizardBadge } from "../wizard-badge";
import { WizardFrame } from "./wizard-frame";

/**
 * The wizard's opening announcement (HOU-719). Shown on the FIRST run of the
 * new cloud app (the old desktop app auto-updates into this one, so there is
 * no separate "download the new app" step). A hero moment on the shared space
 * backdrop: headline, one short line, three benefit badges, one big CTA.
 * Deliberately no walls of text — the audience skims. `detection` stays in
 * the props for the caller's analytics.
 *
 * Everything that only LABELS state (the beta badge, the three benefits) is a
 * non-interactive {@link WizardBadge} — a hairline, fill-less chip — so the
 * single filled CTA ("Migrate Now") reads as the one and only thing to press.
 */
export function OfferScreen({
  onStart,
  onSkip,
}: {
  detection: LegacyDetection;
  onStart: () => Promise<void> | void;
  onSkip: () => void;
}) {
  const { t } = useTranslation("migration");

  return (
    <WizardFrame
      mark={<HoustonLogo size={56} />}
      badge={
        <WizardBadge icon={<Sparkles aria-hidden />} onPhoto>
          {t("offer.betaBadge")}
        </WizardBadge>
      }
      title={t("offer.title")}
      body={t("offer.body")}
      footer={
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <AsyncButton
            className="h-11 w-full rounded-full px-6 text-base"
            onClick={() => onStart()}
          >
            {t("offer.start")}
          </AsyncButton>
          <p className="text-xs text-[var(--ht-space-foreground-muted)]">
            {t("offer.freeNote")}
          </p>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full px-3 py-1 text-xs text-[var(--ht-space-foreground-muted)] transition-colors hover:text-[var(--ht-space-foreground)]"
          >
            {t("offer.migrateLater")}
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <WizardBadge icon={<Clock aria-hidden />} onPhoto>
          {t("offer.benefit1")}
        </WizardBadge>
        <WizardBadge icon={<RefreshCw aria-hidden />} onPhoto>
          {t("offer.benefit2")}
        </WizardBadge>
        <WizardBadge icon={<UploadCloud aria-hidden />} onPhoto>
          {t("offer.benefit3")}
        </WizardBadge>
      </div>
    </WizardFrame>
  );
}
