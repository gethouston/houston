import { useTranslation } from "react-i18next";
import { fewModels, roundedModelCount } from "./format.ts";

/**
 * The AI models hub masthead: the app-wide landing-page header (matching
 * Settings / Integrations / Organization) — a 28px normal-weight h1 + a muted
 * one-line subtitle, so every top-level surface opens the same way. The model
 * count rounds DOWN to the nearest 50 so the copy reads as a confident round
 * number ("400+"); when few providers are visible the rounded number would read
 * "0+", so the subtitle drops the number entirely. Presentational, props-only.
 */
export function HubHero({ modelCount }: { modelCount: number }) {
  const { t } = useTranslation("aiHub");

  return (
    <header>
      <h1 className="text-[28px] font-normal text-foreground">
        {t("hero.title")}
      </h1>
      <p className="mt-1 max-w-[46ch] text-sm text-muted-foreground">
        {fewModels(modelCount)
          ? t("hero.subtitleFew")
          : t("hero.subtitle", { models: roundedModelCount(modelCount) })}
      </p>
    </header>
  );
}
