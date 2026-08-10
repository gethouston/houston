import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import { headerCollapsesTabs } from "../shell/page-header/page-header-layout";
import { PageHeaderSwitcher } from "../shell/page-header/page-header-switcher";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";
import { usePageHeaderMode } from "../shell/page-header/page-header-tools";
import type { ManageTeamPaneId } from "./manage-team-panes";

export function ManageTeamHeader({
  active,
  panes,
  teamName,
  onSelect,
}: {
  active: ManageTeamPaneId;
  panes: readonly ManageTeamPaneId[];
  teamName: string;
  onSelect: (pane: ManageTeamPaneId) => void;
}) {
  const { t } = useTranslation("teams");
  const collapsed = headerCollapsesTabs(usePageHeaderMode());
  const identity = (
    <>
      <Settings aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 truncate">
        {t("teamView.manage.identity", { name: teamName })}
      </span>
    </>
  );
  // The identity lozenge stands for whatever pane LEADS this team's list
  // (context normally; agents when an old gateway serves no context field),
  // the way the team's own lozenge stands for its board.
  const first = panes[0];
  const items = panes.map((id) => ({
    id,
    heading: id === first,
    label: id === first ? identity : t(`teamView.manage.tabs.${id}` as const),
    dataAttrs: { "data-manage-tab": id },
  }));
  // The switcher MENU names every pane outright: inside a list of pane names,
  // "the identity lozenge stands for it" stops being legible.
  const switcherItems = panes.map((id) => ({
    id,
    label: t(`teamView.manage.tabs.${id}` as const),
    dataAttrs: { "data-manage-tab": id },
  }));

  return (
    <PageHeader>
      {collapsed ? (
        <PageHeaderSwitcher
          identity={identity}
          items={switcherItems}
          active={active}
          label={t("teamView.tabs.label")}
          onSelect={onSelect}
        />
      ) : (
        <PageHeaderTabs
          items={items}
          active={active}
          label={t("teamView.tabs.label")}
          onSelect={onSelect}
        />
      )}
    </PageHeader>
  );
}
