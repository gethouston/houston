import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-shell";
import { fewModels, roundedModelCount } from "./format.ts";

/**
 * The AI models hub masthead: the app-wide landing-page header (matching
 * Settings / Integrations / Organization) via the shared `PageHeader`, so every
 * top-level surface opens the same way. The model count rounds DOWN to the
 * nearest 50 so the copy reads as a confident round number ("400+"); when few
 * providers are visible the rounded number would read "0+", so the subtitle
 * drops the number entirely. Presentational, props-only.
 */
export function HubHero({ modelCount }: { modelCount: number }) {
  const { t } = useTranslation("aiHub");

  return (
    <PageHeader
      title={t("hero.title")}
      subtitle={
        fewModels(modelCount)
          ? t("hero.subtitleFew")
          : t("hero.subtitle", { models: roundedModelCount(modelCount) })
      }
    />
  );
}
