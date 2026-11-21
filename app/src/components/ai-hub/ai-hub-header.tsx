import { Boxes } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";

export type AiHubMode = "providers" | "models";

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
