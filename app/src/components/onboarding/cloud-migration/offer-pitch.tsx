import { Clock, RefreshCw, UploadCloud } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

const BENEFITS = [
  [Clock, "benefit1"],
  [RefreshCw, "benefit2"],
  [UploadCloud, "benefit3"],
] as const;

export function OfferPitch() {
  const { t } = useTranslation("migration");

  return (
    <div className="rounded-xl border border-line bg-card p-4 shadow-sm">
      <p className="text-[13px] font-semibold text-ink">
        {t("offer.whatTitle")}
      </p>
      <ul className="mt-3 space-y-2.5">
        {BENEFITS.map(([Icon, key]) => (
          <li key={key} className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-gradient-to-b from-input to-chip shadow-sm">
              <Icon className="size-4 text-ink" aria-hidden />
            </span>
            <span className="text-[13px] leading-snug text-ink-muted">
              <Trans
                ns="migration"
                i18nKey={`offer.${key}`}
                components={{ b: <strong className="font-medium text-ink" /> }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
