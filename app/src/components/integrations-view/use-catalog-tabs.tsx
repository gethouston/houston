import type { CatalogShellTab } from "@houston-ai/core";
import type {
  CustomIntegrationView,
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import {
  type ConnectFlow,
  CustomIntegrationsSection,
  type PermissionsFix,
} from "../integrations";
import { matchesQuery } from "../integrations/browse-model";
import { CatalogPane } from "./catalog-pane";

/**
 * The Available section's two discovery tabs, shared VERBATIM by the global
 * Integrations page and the per-agent Integrations tab (the blocks used to be
 * copy-paste twins): the **Integrations** catalog tab (the controlled
 * {@link CatalogPane}) and, when the host serves the feature
 * (`customData !== null`), the **Custom integrations** tab. A successful
 * connect clears the shared query only when the landed app still matches it,
 * so a late OAuth completion can never erase a newer search. The agent surface
 * passes `agent` (per-agent custom routes + chat, HOU-823), its `allowlist` +
 * `lockedFix` (locked browse rows), and its disallowed-apps section as
 * `children`; the global page passes none of them.
 */
export function useCatalogTabs({
  catalog,
  connections,
  surface,
  query,
  setQuery,
  category,
  isLoading,
  connectFlow,
  onRemove,
  catalogCount,
  customData,
  customListFailed = false,
  agent,
  tabActive,
  allowlist = null,
  lockedFix,
  children,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  surface: string;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  category: string;
  isLoading: boolean;
  connectFlow: ConnectFlow;
  onRemove: (toolkit: string, connectionId?: string) => void;
  /** The catalog tab's count chip (undefined while loading hides it). */
  catalogCount: number | undefined;
  /** `null` = host without custom integrations (no tab), `undefined` = still
   *  loading (no tab yet either — it appears when the list resolves, so the
   *  chip never flickers in and out on a host that answers `null`). */
  customData: CustomIntegrationView[] | null | undefined;
  /** The custom list query FAILED (a real error, not the 404 degrade): the
   *  tab still renders so the section can show its error + retry state —
   *  a transient 500 must never silently erase the whole custom surface. */
  customListFailed?: boolean;
  agent?: Agent;
  /** Per-agent surface: whether that tab owns the visible agent screen
   *  (TabProps.isActive) — gates the setup chat's shared shell panel. */
  tabActive?: boolean;
  allowlist?: string[] | null;
  lockedFix?: PermissionsFix;
  children?: ReactNode;
}): CatalogShellTab[] {
  const { t } = useTranslation("integrations");
  return [
    {
      value: "catalog",
      label: t("home.tabs.catalog"),
      count: catalogCount,
      content: (
        <CatalogPane
          catalog={catalog}
          connections={connections}
          surface={surface}
          query={query}
          category={category}
          isLoading={isLoading}
          connectFlow={connectFlow}
          onConnected={(toolkit) =>
            setQuery((currentQuery) => {
              if (!currentQuery.trim()) return currentQuery;
              const app = catalog.find((item) => item.slug === toolkit);
              return app && matchesQuery(app, currentQuery.trim().toLowerCase())
                ? ""
                : currentQuery;
            })
          }
          onRemove={onRemove}
          allowlist={allowlist}
          lockedFix={lockedFix}
        >
          {children}
        </CatalogPane>
      ),
    },
    ...(customData != null || customListFailed
      ? [
          {
            value: "custom",
            label: t("home.tabs.custom"),
            count: customData?.length,
            content: (
              <CustomIntegrationsSection
                variant="tab"
                agent={agent}
                tabActive={tabActive}
              />
            ),
          },
        ]
      : []),
  ];
}
