import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import {
  type HeaderThresholds,
  headerCollapsesTabs,
} from "../shell/page-header/page-header-layout";
import { PageHeaderSwitcher } from "../shell/page-header/page-header-switcher";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";
import { usePageHeaderMode } from "../shell/page-header/page-header-tools";
import { DEFAULT_ORG_TAB, type OrgTabId } from "./org-view-model";

/**
 * The widest forms are Spanish. Dashboard level: identity "Administración"
 * ~141px (glyph 16 + 6 gap + text + px-3), Personas ~84, Facturación ~99,
 * Analítica ~86, plus 3 × 2px gaps and the track's 4px padding ≈ 420, plus
 * the strip's 40px `px-5` = 460, rounded UP to 480. There is no right-zone
 * tools cluster, so below the line it collapses into its switcher.
 */
export const ADMIN_HEADER_THRESHOLDS: HeaderThresholds = {
  oneRowMin: 480,
};

/**
 * The Admin strip, in the shared header grammar (Integrations, the team
 * screen): one lozenge cluster where the identity IS the first section.
 *
 * **Admin is the first lozenge.** It wears the rail row's mark (`Building2`)
 * and name — the door and the page agree on what this place looks like —
 * carries the screen's `<h1>`, and stands for Company context, the landing
 * section: the standing knowledge every agent starts a turn with is what
 * Admin looks like when you arrive. (The body says so itself: that section
 * opens on its own titled hero, so the lozenge doesn't have to name it.) The
 * other sections follow as plain
 * lozenges.
 *
 * Narrow: the cluster collapses into the identity switcher, whose menu names
 * every section — Company context included, because inside a list of section
 * names "the identity lozenge stands for it" stops being legible.
 *
 */
export function AdminHeader({
  active,
  visibleIds,
  onSelect,
}: {
  active: OrgTabId;
  /** The sections visible for this caller + space, from `orgTabIds`. */
  visibleIds: readonly OrgTabId[];
  onSelect: (id: OrgTabId) => void;
}) {
  const { t } = useTranslation("teams");
  const collapsed = headerCollapsesTabs(usePageHeaderMode());

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
