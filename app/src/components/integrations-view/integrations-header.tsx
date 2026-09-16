import { Blocks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import { PageHeaderSwitcher } from "../shell/page-header/page-header-switcher";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";
import { usePageHeaderTabsCollapsed } from "../shell/page-header/page-header-tools";
import {
  DEFAULT_INTEGRATIONS_TAB,
  type IntegrationsTabId,
} from "./integrations-view-model";

/**
 * The widest forms are Spanish. The cluster: identity "Integraciones" ~125px
 * (glyph 16 + 6 gap + text ~79 + px-3), "Skills" ~57 (text ~33 + px-3), a 2px
 * gap between them and the track's 4px padding ≈ 188. The right zone is the
 * WIDER of the two tabs' tools — the catalog's ~582px (compact search 220 + 8
 * + category filter 150 + 8 + Add custom 196), against the library's ~333
 * (search 220 + 8 + Create skill 105). `188 + 582 + 40 (px-5) + 12 (zone gap)
 * = 822`, rounded UP to 830. Below that the tools take the body row.
 */
export const INTEGRATIONS_HEADER_THRESHOLDS: HeaderThresholds = {
  oneRowMin: 830,
};

/**
 * The Integrations strip, in the shared header grammar (Admin, the team
 * screen): one lozenge cluster where the identity IS the first tab.
 *
 * **"Integrations" is the first lozenge.** It wears the rail row's mark
 * (`Blocks`) — the door and the page agree on what this place looks like —
 * carries the screen's `<h1>`, and stands for the apps catalog, the landing
 * tab. The shared Skills library follows as a plain lozenge, for the callers
 * who hold it: both tabs answer "what can my agents reach outside themselves".
 *
 * Phone: the cluster collapses into the identity switcher, whose menu names
 * both tabs — inside a list of tab names "the identity lozenge stands for it"
 * stops being legible.
 */
export function IntegrationsHeader({
  active,
  visibleIds,
  onSelect,
}: {
  active: IntegrationsTabId;
  /** The tabs visible for this caller, from `integrationsTabIds`. */
  visibleIds: readonly IntegrationsTabId[];
  onSelect: (id: IntegrationsTabId) => void;
}) {
  const { t } = useTranslation(["integrations", "skills"]);
  // A caller without the Skills tab has nothing to switch, so the cluster
  // stays the static heading lozenge at every width rather than collapsing
  // into a menu with one entry that changes nothing when picked.
  const collapsed = usePageHeaderTabsCollapsed() && visibleIds.length > 1;

  const identity = (
    <>
      <Blocks aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 truncate">
        {t("integrations:home.tabs.catalog")}
      </span>
    </>
  );
  const label = (id: IntegrationsTabId) =>
    id === DEFAULT_INTEGRATIONS_TAB
      ? t("integrations:home.tabs.catalog")
      : t("skills:global.pageTitle");
  const tabs = visibleIds.map((id) => ({
    id,
    ...(id === DEFAULT_INTEGRATIONS_TAB
      ? { heading: true, label: identity }
      : { label: label(id) }),
    dataAttrs: { "data-integrations-tab": id },
  }));
  const switcherTabs = visibleIds.map((id) => ({
    id,
    label: label(id),
    dataAttrs: { "data-integrations-tab": id },
  }));

  return (
    <PageHeader>
      {collapsed ? (
        <PageHeaderSwitcher
          identity={identity}
          items={switcherTabs}
          active={active}
          label={t("integrations:home.tabs.label")}
          onSelect={onSelect}
          dataAttrs={{ "data-integrations-switcher": "" }}
        />
      ) : (
        <PageHeaderTabs
          items={tabs}
          active={active}
          label={t("integrations:home.tabs.label")}
          onSelect={onSelect}
        />
      )}
    </PageHeader>
  );
}
