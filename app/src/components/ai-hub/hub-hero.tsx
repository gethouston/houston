import { useTranslation } from "react-i18next";
import { fewModels, roundedModelCount } from "./format.ts";

/**
 * The AI models hub masthead: a calm display h1 + a one-line subtitle, on
 * generous whitespace with no decorative gradient (Linear restraint). The model
 * count rounds DOWN to the nearest 50 so the copy reads as a confident round
 * number ("400+"); when few providers are visible the rounded number would read
 * "0+", so the subtitle drops the number entirely. Presentational, props-only.
 */
export function HubHero({ modelCount }: { modelCount: number }) {
  const { t } = useTranslation("aiHub");

  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-[34px] font-semibold tracking-[-0.02em] text-foreground">
        {t("hero.title")}
      </h1>
      <p className="max-w-[46ch] text-base text-muted-foreground">
        {fewModels(modelCount)
          ? t("hero.subtitleFew")
          : t("hero.subtitle", { models: roundedModelCount(modelCount) })}
      </p>
    </header>
  );
}
