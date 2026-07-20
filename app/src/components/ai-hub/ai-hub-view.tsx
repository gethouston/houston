import {
  CatalogSearchField,
  CatalogShell,
  type CatalogShellTab,
  cn,
} from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useProviderConnections } from "../../hooks/use-provider-connections";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types";
import { searchModels } from "../../lib/ai-hub/search";
import { useHubCatalog } from "../../lib/ai-hub/use-hub-catalog";
import { newEngineActive } from "../../lib/engine";
import { osIsTauri } from "../../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
  type ProviderInfo,
} from "../../lib/providers";
import { searchProviders } from "../provider-browser/provider-filtering";
import { groupProviders } from "../provider-browser/provider-grouping";
import { PageContainer } from "../shell/page-shell";
import { ConnectedProvidersStrip } from "./connected-providers-strip";
import { HubHero } from "./hub-hero";
import { HubModalStack } from "./hub-modal-stack";
import { HubSkeleton } from "./hub-skeleton";
import { ModelDirectory } from "./model-directory";
import { ProvidersPane } from "./providers-pane";

/**
 * The AI models hub: a top-level marketplace surface in the shared
 * {@link CatalogShell} grammar (the same layout as the Integrations page) —
 * the hero, then ONE search field over everything, the consolidated
 * **Connected** strip of provider rows OUTSIDE the tabs (a row opens that
 * provider's modal), then the **Available** discovery tabs with live count
 * chips: **Providers** ({@link ProvidersPane}: the not-yet-connected catalog)
 * and **Models** (the cross-provider directory). The one query narrows the
 * Connected strip and both tabs' content at once.
 * A provider row or model row opens a centered MODAL (`ProviderModal` /
 * `ModelModal`); the connect-dialog stack renders once here for every surface
 * underneath. (Workspace model policy lives on the Admin page.)
 */
export function AiHubView() {
  const { t } = useTranslation("aiHub");
  const { catalog, isLoading } = useHubCatalog();
  const connections = useProviderConnections();
  const [tab, setTab] = useState("providers");
  // The page's ONE search field, above everything: it narrows the Connected
  // strip AND both discovery tabs' content.
  const [query, setQuery] = useState("");
  const [openProvider, setOpenProvider] = useState<ProviderInfo | null>(null);
  const [openModel, setOpenModel] = useState<CatalogModel | null>(null);

  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);
  // The connect cards this deployment can show (merged OpenCode account, engine
  // + capability gated) — the same set the catalog counts its offers from.
  const connectProviders = useMemo(
    () =>
      getConnectProviders({
        newEngine,
        desktop: osIsTauri(),
        capabilities: providerCapabilities,
      }),
    [newEngine, providerCapabilities],
  );
  // Connected providers live in the strip; only the rest browse in the tab.
  // Until the first status probe resolves everything counts as available (the
  // pane holds a skeleton and the counts stay hidden meanwhile).
  const { connected, available } = useMemo(
    () => groupProviders(connectProviders, connections.isConnected),
    [connectProviders, connections.isConnected],
  );

  // The page query narrows both provider sections; `searching` uncaps the
  // Connected strip's preview and switches the count chips to shown-count.
  const searching = query.trim() !== "";
  const connectedMatches = useMemo(
    () => searchProviders(connected, query),
    [connected, query],
  );
  const availableMatches = useMemo(
    () => searchProviders(available, query),
    [available, query],
  );
  // Models tab chip: models matching the page query (facets narrow further).
  const modelMatches = useMemo(
    () => (catalog ? searchModels(catalog.models, query) : []),
    [catalog, query],
  );

  // While a modal is up, freeze the page scroller behind it. Radix's scroll
  // lock only locks <body>; this inner region kept its own live scrollbar,
  // which sat next to the modal's as a second, draggable vertical scroll.
  // Hidden boxes are still scroll containers, so `scrollbar-gutter: stable`
  // keeps the gutter reserved and the scroll offset holds.
  const modalOpen = openProvider !== null || openModel !== null;

  const tabs: CatalogShellTab[] | null = catalog
    ? [
        {
          value: "providers",
          label: t("tabs.providers"),
          count: connections.ready
            ? searching
              ? availableMatches.length
              : available.length
            : undefined,
          content: (
            <ProvidersPane
              providers={available}
              query={query}
              connections={connections}
              catalog={catalog}
              onOpen={setOpenProvider}
            />
          ),
        },
        {
          value: "models",
          label: t("tabs.models"),
          count: searching ? modelMatches.length : catalog.modelCount,
          content: (
            <ModelDirectory
              catalog={catalog}
              query={query}
              onOpenModel={(key) => {
                const model = catalog.byKey.get(key);
                if (model) setOpenModel(model);
              }}
            />
          ),
        },
      ]
    : null;

  return (
    <div
      className={cn(
        "h-full [scrollbar-gutter:stable]",
        modalOpen ? "overflow-y-hidden" : "overflow-y-auto",
      )}
    >
      <PageContainer className="flex flex-col gap-6 py-10">
        {!catalog || !tabs ? (
          <HubSkeleton loading={isLoading} />
        ) : (
          <>
            <HubHero modelCount={catalog.modelCount} />
            <CatalogShell
              controls={
                <CatalogSearchField
                  value={query}
                  onChange={setQuery}
                  label={t("search.placeholder")}
                />
              }
              installedTitle={t("sections.connected")}
              installedCount={
                connections.ready
                  ? searching
                    ? connectedMatches.length
                    : connected.length
                  : undefined
              }
              availableTitle={t("sections.available")}
              installed={
                connections.ready && connectedMatches.length > 0 ? (
                  <ConnectedProvidersStrip
                    providers={connectedMatches}
                    searching={searching}
                    onOpen={setOpenProvider}
                  />
                ) : undefined
              }
              tabs={tabs}
              value={tab}
              onValueChange={setTab}
            />
          </>
        )}
      </PageContainer>

      {catalog && (
        <HubModalStack
          catalog={catalog}
          connections={connections}
          openProvider={openProvider}
          setOpenProvider={setOpenProvider}
          openModel={openModel}
          setOpenModel={setOpenModel}
        />
      )}
    </div>
  );
}
