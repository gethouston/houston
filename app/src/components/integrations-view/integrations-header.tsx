import { Blocks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";

/**
 * The widest form is Spanish. The cluster is the identity lozenge alone:
 * "Integraciones" ~125px (glyph 16 + 6 gap + text ~79 + px-3) plus the track's
 * 4px padding ≈ 129. The right zone is the catalog's tools, ~582px (compact
 * search 220 + 8 + category filter 150 + 8 + Add custom 196). `129 + 582 + 40
 * (px-5) + 12 (zone gap) = 763`, rounded UP to 770. Below that the tools take
 * the body row.
 */
export const INTEGRATIONS_HEADER_THRESHOLDS: HeaderThresholds = {
  oneRowMin: 770,
};

/**
 * The Integrations strip, in the shared header grammar (Admin, the team
 * screen): one static heading lozenge wearing the rail row's mark (`Blocks`),
 * so the door and the page agree on what this place looks like. It carries the
 * screen's `<h1>` and stands for the apps catalog, the screen's one surface,
 * at every width.
 */
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
