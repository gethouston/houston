import type { CustomIntegrationView } from "@houston-ai/engine-client";
import { Blocks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";

export type IntegrationsMode = "catalog" | "custom";

/**
 * The two lozenges are ~284px: Integrations 105 + its glyph (16 + 6 gap),
 * Custom integrations 155, plus their 2px gap. The right zone is ~378px:
 * compact search 220 + 8 + category filter 150. `284 + 378 + 40 (px-5) + 12
 * (zone gap) = 714`, rounded UP to 720. There is no compact form: collapsing
 * two lozenges saves too little to buy a useful middle mode, so below this
 * point the tools stack honestly.
 */
export const INTEGRATIONS_HEADER_THRESHOLDS: HeaderThresholds = {
  oneRowMin: 720,
};

export function customModeAvailable(
  customData: CustomIntegrationView[] | null | undefined,
  customListFailed: boolean,
): boolean {
  return customData != null || customListFailed;
}

export function IntegrationsHeader({
  active,
  onSelect,
  customData,
  customListFailed,
}: {
  active: IntegrationsMode;
  onSelect: (mode: IntegrationsMode) => void;
  customData: CustomIntegrationView[] | null | undefined;
  customListFailed: boolean;
}) {
  const { t } = useTranslation("integrations");
  const items = [
    {
      id: "catalog" as const,
      // The identity lozenge wears the same mark the rail's Integrations row
      // does, exactly as a team's lozenge wears its glyph: the door and the
      // page agree on what this place looks like. No count chips up here —
      // the catalog's size is already stated once, on the Available section
      // heading, and a number repeated in the chrome is bookkeeping.
      label: (
        <>
          <Blocks aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 truncate">{t("home.tabs.catalog")}</span>
        </>
      ),
      heading: true,
    },
    ...(customModeAvailable(customData, customListFailed)
      ? [{ id: "custom" as const, label: t("home.tabs.custom") }]
      : []),
  ];

  return (
    <PageHeader>
      <PageHeaderTabs
        items={items}
        active={active}
        label={t("home.tabs.label")}
        onSelect={onSelect}
      />
    </PageHeader>
  );
}
