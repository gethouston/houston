import { AsyncButton } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import astroJpg from "../../../assets/space/astro-960.jpg";
import astroWebp from "../../../assets/space/astro-960.webp";
import type { LegacyDetection } from "../../../lib/cloud-migration";
import { OfferPitch } from "./offer-pitch";
import { OfferSkipConfirm } from "./offer-skip-confirm";

/**
 * The wizard's opening announcement (HOU-719). Shown on the FIRST run of the
 * new cloud app (the old desktop app auto-updates into this one). Adapts the
 * "Move to the cloud" announcement modal (PR-1003) to the first-run flow: a
 * bounded, elevated white split card centered on the calm grey
 * {@link FirstRunScreen} page (not a modal overlay, no space backdrop behind
 * it) — a full-height astronaut side image with a seam-blend gradient, then a
 * content column with the early-believer copy, the "what you get" pitch, a
 * free-note footnote, and one full-width pill CTA. The quiet escape below it
 * is honest about the consequence — skipping starts the app empty — and opens
 * {@link OfferSkipConfirm} before it runs the caller's `onSkip`. `detection`
 * stays in the props for the caller's analytics.
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
  const [skipConfirmOpen, setSkipConfirmOpen] = useState(false);

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-10">
      {/* Borderless split card: the shadow separates it from the grey page, a
          hairline would read as a gap between the full-bleed image and the
          card edge. The image takes a side column so the pitch keeps a
          comfortable measure beside it. */}
      <div className="relative flex w-full max-w-[820px] overflow-hidden rounded-2xl bg-card text-ink shadow-[0_16px_60px_rgba(0,0,0,0.12)]">
        {/* space-canvas underlay: any subpixel sliver the cover-crop leaves at
            the rounded edge reads as space-dark, never white. */}
        <div className="relative hidden w-[360px] shrink-0 self-stretch bg-[var(--ht-space-canvas)] sm:block">
          <picture className="absolute inset-0 block">
            <source type="image/webp" srcSet={astroWebp} />
            <img
              src={astroJpg}
              alt=""
              aria-hidden="true"
              width={960}
              height={1440}
              decoding="async"
              className="block h-full w-full object-cover"
            />
          </picture>
          {/* Seam blend: a whisper of shadow where the photo meets the card, so
              the edge reads composed instead of cut. */}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-12 bg-gradient-to-r from-transparent to-black/20"
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 px-8 pb-8 pt-7 text-left">
          <div className="space-y-2">
            <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight">
              {t("offer.title")}
            </h1>
            <p className="text-pretty text-sm leading-relaxed text-ink-muted">
              {t("offer.body")}
            </p>
          </div>

          <OfferPitch />

          {/* Above the CTA on purpose: the pill is the one thing to press. */}
          <p className="mt-1 text-xs leading-snug text-ink-muted">
            {t("offer.freeNote")}
          </p>
          <AsyncButton
            className="h-11 w-full rounded-full px-6 text-base"
            onClick={() => onStart()}
          >
            {t("offer.start")}
          </AsyncButton>
          <button
            type="button"
            onClick={() => setSkipConfirmOpen(true)}
            className="self-center rounded-full px-3 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
          >
            {t("offer.skipAction")}
          </button>
        </div>
      </div>

      <OfferSkipConfirm
        open={skipConfirmOpen}
        onOpenChange={setSkipConfirmOpen}
        onConfirmSkip={onSkip}
      />
    </div>
  );
}
