import { AsyncButton } from "@houston-ai/core";
import { Clock, RefreshCw, Sparkles, UploadCloud } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LegacyDetection } from "../../../lib/cloud-migration";
import { WizardFrame } from "./wizard-frame";

/**
 * The wizard's opening announcement (HOU-719). Shown on the FIRST run of the
 * new cloud app (the old desktop app auto-updates into this one, so there is no
 * separate "download the new app" step): it welcomes the user, sells the cloud
 * move (always on, routines keep running, nothing left behind), previews the
 * two things that happen next, reassures that it's free and quick, and starts
 * the migration. `detection` stays in the props for the caller's analytics.
 */
function Benefit({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border/70 bg-secondary p-4 text-left">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-background">
          {icon}
        </span>
        <h3 className="text-[0.9rem] font-semibold leading-tight">{title}</h3>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 px-3 text-center">
      <span className="relative z-10 grid size-7 place-items-center rounded-full border border-border bg-background text-xs font-semibold tabular-nums">
        {n}
      </span>
      <h4 className="mt-2 text-sm font-semibold">{title}</h4>
      <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

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
      wide
      badge={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
          <Sparkles className="size-3.5" aria-hidden />
          {t("offer.betaBadge")}
        </span>
      }
      title={t("offer.title")}
      body={t("offer.body")}
      footer={
        <div className="flex w-full max-w-xs flex-col items-center gap-3">
          <AsyncButton
            className="w-full rounded-full px-6"
            onClick={() => onStart()}
          >
            {t("offer.start")}
          </AsyncButton>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("offer.startFresh")}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-7">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Benefit
            icon={<Clock className="size-4" aria-hidden />}
            title={t("offer.benefit1Title")}
            body={t("offer.benefit1Body")}
          />
          <Benefit
            icon={<RefreshCw className="size-4" aria-hidden />}
            title={t("offer.benefit2Title")}
            body={t("offer.benefit2Body")}
          />
          <Benefit
            icon={<UploadCloud className="size-4" aria-hidden />}
            title={t("offer.benefit3Title")}
            body={t("offer.benefit3Body")}
          />
        </div>

        <div>
          <p className="mb-4 text-center text-xs font-semibold text-muted-foreground">
            {t("offer.howTitle")}
          </p>
          <div className="relative flex">
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/4 right-1/4 top-3.5 h-px -translate-y-1/2 bg-border"
            />
            <Step
              n="1"
              title={t("offer.step1Title")}
              body={t("offer.step1Body")}
            />
            <Step
              n="2"
              title={t("offer.step2Title")}
              body={t("offer.step2Body")}
            />
          </div>
        </div>

        <div className="rounded-xl bg-secondary p-4 text-left text-sm leading-relaxed text-muted-foreground">
          <p>{t("offer.freeNote")}</p>
          <p className="mt-2">{t("offer.keepOpen")}</p>
        </div>
      </div>
    </WizardFrame>
  );
}
