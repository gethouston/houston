import { AsyncButton } from "@houston-ai/core";
import { Clock, RefreshCw, Sparkles, UploadCloud } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LegacyDetection } from "../../../lib/cloud-migration";
import { HoustonLogo } from "../../shell/experience-card";
import { WizardFrame } from "./wizard-frame";

/** One benefit, one breath: an icon + a few words, never a paragraph. */
function Benefit({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-chip px-4 py-2 text-sm font-medium text-ink">
      {icon}
      {label}
    </span>
  );
}

/**
 * The wizard's opening announcement (HOU-719). Shown on the FIRST run of the
 * new cloud app (the old desktop app auto-updates into this one, so there is
 * no separate "download the new app" step). A hero moment on the shared space
 * backdrop: headline, one short line, three benefit chips, one big CTA.
 * Deliberately no walls of text — the audience skims. `detection` stays in
 * the props for the caller's analytics.
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
        <span className="inline-flex items-center gap-1.5 rounded-full bg-chip px-3 py-1 text-xs font-medium text-ink">
          <Sparkles className="size-3.5" aria-hidden />
          {t("offer.betaBadge")}
        </span>
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
        <Benefit
          icon={<Clock className="size-4" aria-hidden />}
          label={t("offer.benefit1")}
        />
        <Benefit
          icon={<RefreshCw className="size-4" aria-hidden />}
          label={t("offer.benefit2")}
        />
        <Benefit
          icon={<UploadCloud className="size-4" aria-hidden />}
          label={t("offer.benefit3")}
        />
      </div>
    </WizardFrame>
  );
}
