import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import { PageHeaderSwitcher } from "../shell/page-header/page-header-switcher";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";
import { usePageHeaderTabsCollapsed } from "../shell/page-header/page-header-tools";
import { DEFAULT_ORG_TAB, type OrgTabId } from "./org-view-model";

export const ADMIN_HEADER_THRESHOLDS: HeaderThresholds = {
  oneRowMin: 720,
};

export function AdminHeader({
  active,
  visibleIds,
  onSelect,
}: {
  active: OrgTabId;
  visibleIds: readonly OrgTabId[];
  onSelect: (id: OrgTabId) => void;
}) {
  const { t } = useTranslation("teams");
  const collapsed = usePageHeaderTabsCollapsed();

  const identity = (
    <>
      <Building2 aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{t("org.title")}</span>
    </>
  );
  const tabs = visibleIds.map((id) =>
    id === DEFAULT_ORG_TAB
      ? {
          id,
          heading: true,
          label: identity,
          dataAttrs: { "data-admin-section-tab": id },
        }
      : {
          id,
          label: t(`org.tabs.${id}`),
          dataAttrs: { "data-admin-section-tab": id },
        },
  );
  const switcherSections = visibleIds.map((id) => ({
    id,
    label: t(`org.tabs.${id}`),
    dataAttrs: { "data-admin-section-tab": id },
  }));

  return (
    <PageHeader>
      {collapsed ? (
        <PageHeaderSwitcher
          identity={identity}
          items={switcherSections}
          active={active}
          label={t("org.tabs.label")}
          onSelect={onSelect}
          dataAttrs={{ "data-admin-section-switcher": "" }}
        />
      ) : (
        <PageHeaderTabs
          items={tabs}
          active={active}
          label={t("org.tabs.label")}
          onSelect={onSelect}
        />
      )}
    </PageHeader>
  );
}
