import { useTranslation } from "react-i18next";
import { fewModels, roundedModelCount } from "./format.ts";

/**
 * The AI models hub masthead: a calm h1 + one-line subtitle. The model count
 * rounds DOWN to the nearest 50 so the copy reads as a confident round number
 * ("400+"). When few providers are visible the rounded number would read "0+",
 * so the subtitle drops the number entirely. Presentational and props-only.
 */
export function HubHero({ modelCount }: { modelCount: number }) {
  const { t } = useTranslation("aiHub");

  return (
    <header className="flex flex-col gap-3">
      <h1 className="text-[28px] font-normal leading-tight tracking-tight text-foreground">
        {t("hero.title")}
      </h1>
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
        {fewModels(modelCount)
          ? t("hero.subtitleFew")
          : t("hero.subtitle", { models: roundedModelCount(modelCount) })}
      </p>
    </header>
  );
}
