import { Blocks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";

/**
 * The identity lozenge is ~131px: Integrations 73 + its glyph (16 + 6 gap),
 * 24px horizontal padding, and 4px track padding. The right zone is ~582px:
 * compact search 220 + 8 + category filter 150 + 8 + Add custom 196.
 * `131 + 582 + 40 (px-5) + 12 (zone gap) = 765`, rounded UP to 780.
 * A single lozenge has nothing useful to collapse.
 */
export const INTEGRATIONS_HEADER_THRESHOLDS: HeaderThresholds = {
  oneRowMin: 780,
};

export function IntegrationsHeader() {
  const { t } = useTranslation("integrations");
  return (
    <PageHeader>
      <PageHeaderTabs
        items={[
          {
            id: "integrations",
            label: (
              <>
                <Blocks aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 truncate">
                  {t("home.tabs.catalog")}
                </span>
              </>
            ),
            heading: true,
          },
        ]}
        active="integrations"
        label={t("home.tabs.label")}
        onSelect={() => {}}
      />
    </PageHeader>
  );
}
