import { useCallback, useEffect } from "react";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { analytics } from "../../lib/analytics";
import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { SkillsBody } from "../skills-view";
import { CatalogTab } from "./catalog-tab";
import {
  INTEGRATIONS_HEADER_THRESHOLDS,
  IntegrationsHeader,
} from "./integrations-header";
import { useIntegrationsNav } from "./integrations-nav-store";
import {
  DEFAULT_INTEGRATIONS_TAB,
  type IntegrationsTabId,
  integrationsTabIds,
} from "./integrations-view-model";

/**
 * The global personal Integrations surface: what this person's agents can
 * reach outside themselves, in two tabs under one lozenge cluster. The apps
 * CATALOG is the landing tab and the identity lozenge; the shared SKILLS
 * library follows for the space owner who holds it.
 *
 * ONE tools provider spans both tabs, so whichever body is mounted portals its
 * own search and actions into the same strip — and only one is ever mounted,
 * so the two can never claim it at once. Opening a skill hands the WHOLE
 * screen to that skill's editor: it replaces the tab cluster with its own
 * strip (whose back arrow returns to the library), exactly as it replaced the
 * library's header before.
 */
export function IntegrationsView() {
  const { showSkills } = useSurfaceGates();
  const tab = useIntegrationsNav((s) => s.tab);
  const requestTab = useIntegrationsNav((s) => s.requestTab);
  const visibleIds = integrationsTabIds({ showSkills });

  // One event per tab OPENED (a lozenge click or a deep link), keyed like the
  // global view switches so a single tab_name breakdown covers everything.
  // Landing on the screen at all is the shell's own `tab_opened`, so this fires
  // strictly below it — never on the tab already open — and the two never
  // double-count.
  const openTab = useCallback(
    (next: IntegrationsTabId) => {
      if (next !== tab)
        analytics.track("tab_opened", { tab_name: `integrations:${next}` });
      requestTab(next);
    },
    [tab, requestTab],
  );

  // If the gate drops the open tab (the caller stops owning the space on a
  // space switch), fall back to the landing tab rather than a blank body.
  useEffect(() => {
    if (!visibleIds.includes(tab)) requestTab(DEFAULT_INTEGRATIONS_TAB);
  }, [visibleIds, tab, requestTab]);

  const header = (
    <IntegrationsHeader
      active={tab}
      visibleIds={visibleIds}
      onSelect={openTab}
    />
  );

  return (
    <PageHeaderToolsProvider thresholds={INTEGRATIONS_HEADER_THRESHOLDS}>
      {tab === "skills" && showSkills ? (
        <SkillsBody listHeader={header} />
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {header}
          <CatalogTab />
        </div>
      )}
    </PageHeaderToolsProvider>
  );
}
