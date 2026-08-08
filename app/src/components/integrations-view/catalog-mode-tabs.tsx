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
import { type ConnectFlow, CustomIntegrationsSection } from "../integrations";
import { matchesQuery } from "../integrations/browse-model";
import { CatalogPane } from "./catalog-pane";

/**
 * The PAGE-LEVEL source toggle (HOU-980 review): **Integrations** (the
 * Composio world — search, its Installed strip, the browse catalog) vs
 * **Custom integrations** (the API / MCP world — ITS installed list + Add).
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
        <CustomIntegrationsSection variant="tab" />
      </TabsContent>
    </Tabs>
  );
}

/**
 * The Composio browse pane. A successful connect clears the shared query only
 * when the landed app still matches it, so a late OAuth completion can never
 * erase a newer search. A surface may stack its own sections above the catalog
 * by passing them as `children`.
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
    >
      {children}
    </CatalogPane>
  );
}
