import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import { PageHeaderBackChip } from "../shell/page-header/page-header-back-chip";
import { headerCollapsesTabs } from "../shell/page-header/page-header-layout";
import { PageHeaderSwitcher } from "../shell/page-header/page-header-switcher";
import {
  type PageHeaderTabItem,
  PageHeaderTabs,
} from "../shell/page-header/page-header-tabs";
import { usePageHeaderMode } from "../shell/page-header/page-header-tools";
import { type AnalyticsLens, DEFAULT_ANALYTICS_LENS } from "./org-view-model";

/**
 * The Admin strip DRILLED INTO Analytics: the back chip returning to the
 * dashboard, then the section's own lozenge cluster — one navigation grammar
 * on both levels, instead of a second tab style under the first.
 *
 *     (‹ 🏢 Admin) (Analytics)(Usage)(Time worked)
 *
 * **Analytics is the drilled identity lozenge.** It carries the screen's
 * `<h1>` and stands for the lead lens (Activity) — the same "the identity IS
 * the first surface" rule the team lozenge follows. Per the drilled-header
 * rules on {@link PageHeaderBackChip}, it wears NO glyph: only a top-level
 * cluster's identity does, and the bare words plus the chip are what make
 * this read as an inner page.
 *
 * Stateless: the lens (and the deployment's lens set) is owned by
 * `OrganizationView` beside the section state and threaded here, the same
 * way `AdminHeader` receives `active`.
 *
 * Narrow: the cluster collapses into a switcher naming the ACTIVE lens; the
 * back chip stays put.
 */
export function AdminAnalyticsHeader({
  lens,
  lenses,
  onSelectLens,
  onBack,
}: {
  lens: AnalyticsLens;
  lenses: readonly AnalyticsLens[];
  onSelectLens: (lens: AnalyticsLens) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation("teams");
  const collapsed = headerCollapsesTabs(usePageHeaderMode());

  const identity = (
    <span className="min-w-0 truncate">{t("org.tabs.analytics")}</span>
  );
  const tabs = lenses.map((id): PageHeaderTabItem<AnalyticsLens> => {
    const dataAttrs: Record<string, string> = { "data-analytics-lens-tab": id };
    if (id !== DEFAULT_ANALYTICS_LENS)
      return { id, label: t(`org.tabs.${id}`), dataAttrs };
    // The lead lens doubles as the section lozenge, so it keeps the section
    // address the `openAdminSection` helper lands on.
    dataAttrs["data-admin-section-tab"] = "analytics";
    return { id, heading: true, label: identity, dataAttrs };
  });
  // The switcher MENU has to name the lead lens — inside a list of lens
  // names, "the identity lozenge stands for it" stops being legible.
  const switcherLenses = lenses.map((id) => ({
    id,
    label: t(`org.tabs.${id}`),
    dataAttrs: { "data-analytics-lens-tab": id },
  }));

  return (
    <PageHeader>
      <div className="flex min-w-0 items-center gap-2">
        <PageHeaderBackChip
          label={t("org.title")}
          icon={<Building2 aria-hidden className="size-4 shrink-0" />}
          onClick={onBack}
          dataAttrs={{ "data-admin-back": "" }}
        />
        {collapsed ? (
          <PageHeaderSwitcher
            identity={
              <span className="min-w-0 truncate">{t(`org.tabs.${lens}`)}</span>
            }
            items={switcherLenses}
            active={lens}
            label={t("org.tabs.lensLabel")}
            onSelect={onSelectLens}
            dataAttrs={{ "data-analytics-lens-switcher": "" }}
          />
        ) : (
          <PageHeaderTabs
            items={tabs}
            active={lens}
            label={t("org.tabs.lensLabel")}
            onSelect={onSelectLens}
          />
        )}
      </div>
    </PageHeader>
  );
}
