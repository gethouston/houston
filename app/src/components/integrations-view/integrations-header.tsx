import { Blocks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";

export const INTEGRATIONS_HEADER_THRESHOLDS: HeaderThresholds = {
  oneRowMin: 770,
};

export function IntegrationsHeader() {
  const { t } = useTranslation("integrations");
  const title = t("home.tabs.catalog");

  return (
    <PageHeader>
      <PageHeaderTabs
        items={[
          {
            id: "catalog",
            label: (
              <>
                <Blocks aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{title}</span>
              </>
            ),
            heading: true,
            dataAttrs: { "data-integrations-tab": "catalog" },
          },
        ]}
        active="catalog"
        label={title}
        onSelect={() => {}}
      />
    </PageHeader>
  );
}
