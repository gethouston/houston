import { Boxes } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";

export type AiHubMode = "providers" | "models";

/**
 * The two lozenges are ~230px: AI Providers ~127 (glyph + text + padding) +
 * AI Models ~101 + their 2px gap. The tools zone differs PER MODE, so the
 * threshold follows the active mode (the provider re-measures on the prop
 * change) instead of one mode paying for the other's width:
 * - providers: compact search 220 + 8 + the two billing chips ~270 = 498.
 *   `230 + 498 + 40 (px-5) + 12 (zone gap) = 780`.
 * - models: search 220 + 8 + four 150px facet comboboxes + three 8px gaps =
 *   852. `230 + 852 + 40 + 12 = 1134`, rounded UP to 1140.
 * Below its number a mode stacks its tools in the body row.
 */
const PROVIDERS_THRESHOLDS: HeaderThresholds = { oneRowMin: 780 };
const MODELS_THRESHOLDS: HeaderThresholds = { oneRowMin: 1140 };

export function aiHubHeaderThresholds(mode: AiHubMode): HeaderThresholds {
  return mode === "models" ? MODELS_THRESHOLDS : PROVIDERS_THRESHOLDS;
}

export function AiHubHeader({
  active,
  onSelect,
}: {
  active: AiHubMode;
  onSelect: (mode: AiHubMode) => void;
}) {
  const { t } = useTranslation("aiHub");
  const items = [
    {
      id: "providers" as const,
      label: (
        <>
          <Boxes aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{t("header.title")}</span>
        </>
      ),
      heading: true,
    },
    { id: "models" as const, label: t("header.models") },
  ];

  return (
    <PageHeader>
      <PageHeaderTabs
        items={items}
        active={active}
        label={t("header.label")}
        onSelect={onSelect}
      />
    </PageHeader>
  );
}
