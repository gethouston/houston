import { AsyncButton } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import astroJpg from "../../../assets/space/astro-960.jpg";
import astroWebp from "../../../assets/space/astro-960.webp";
import type { LegacyDetection } from "../../../lib/cloud-migration";
import { OfferPitch } from "./offer-pitch";
import { OfferSkipConfirm } from "./offer-skip-confirm";

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
      <div className="relative flex w-full max-w-[820px] overflow-hidden rounded-2xl bg-card text-ink shadow-raised">
        <div className="relative hidden w-[360px] shrink-0 self-stretch bg-gutter sm:block">
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
