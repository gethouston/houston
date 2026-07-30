import {
  CatalogCount,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@houston-ai/core";
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
 * The PAGE-LEVEL source toggle (HOU-980 review): **Integrations** (the
 * Composio world — search, its Installed strip, the browse catalog) vs
 * **Custom integrations** (the API / MCP world — ITS installed list + Add),
 * shared VERBATIM by the global Integrations page and the per-agent tab.
 * One source at a time, each with its own "Installed" up top — the old
 * layout showed custom integrations twice (strip tiles AND tab rows).
 * When the host doesn't serve custom integrations (`customData` `null`, or
 * still `undefined` while loading) the toggle chrome drops and the Composio
 * surface renders bare; a FAILED custom list keeps the tab so the section
 * can show its error + retry state.
 */
export function CatalogModeTabs({
  mode,
  onModeChange,
  catalogCount,
  customData,
  customListFailed = false,
  agent,
  tabActive,
  children,
}: {
  mode: string;
  onModeChange: (value: string) => void;
  /** The Integrations chip (connectable total; undefined while loading). */
  catalogCount: number | undefined;
  /** `null` = host without custom integrations, `undefined` = still loading —
   *  both render the Composio surface without toggle chrome. */
  customData: CustomIntegrationView[] | null | undefined;
  customListFailed?: boolean;
  agent?: Agent;
  /** Per-agent surface: whether that tab owns the visible agent screen
   *  (TabProps.isActive) — gates the setup chat's shared shell panel. */
  tabActive?: boolean;
  /** The Composio-mode content (the surface's own CatalogShell). */
  children: ReactNode;
}) {
  const { t } = useTranslation("integrations");
  if (customData == null && !customListFailed) return <>{children}</>;
  return (
    <Tabs value={mode} onValueChange={onModeChange}>
      <TabsList variant="line" className="mb-6">
        <TabsTrigger value="catalog">
          {t("home.tabs.catalog")}
          {catalogCount != null && <CatalogCount count={catalogCount} />}
        </TabsTrigger>
        <TabsTrigger value="custom">
          {t("home.tabs.custom")}
          {customData != null && <CatalogCount count={customData.length} />}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="catalog">{children}</TabsContent>
      <TabsContent value="custom">
        <CustomIntegrationsSection
          variant="tab"
          agent={agent}
          tabActive={tabActive}
        />
      </TabsContent>
    </Tabs>
  );
}

/**
 * The Composio browse pane, built once for both surfaces (the blocks used to
 * be copy-paste twins). A successful connect clears the shared query only
 * when the landed app still matches it, so a late OAuth completion can never
 * erase a newer search. The agent surface passes its `allowlist` + `lockedFix`
 * (locked browse rows) and its disallowed-apps section as `children`; the
 * global page passes none of them.
 */
export function CatalogBrowsePane({
  catalog,
  connections,
  surface,
  query,
  setQuery,
  category,
  isLoading,
  connectFlow,
  onRemove,
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
  allowlist?: string[] | null;
  lockedFix?: PermissionsFix;
  children?: ReactNode;
}) {
  return (
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
  );
}
