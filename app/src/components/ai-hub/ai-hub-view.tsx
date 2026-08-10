import {
  CATALOG_PLANE_MAX_W,
  CatalogShell,
  type CatalogShellTab,
  cn,
} from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProviderConnections } from "../../hooks/use-provider-connections";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types";
import { useHubCatalog } from "../../lib/ai-hub/use-hub-catalog";
import type { ProviderInfo } from "../../lib/providers";
import {
  filterByQuickFilter,
  type ProviderQuickFilter,
} from "../provider-browser/provider-filtering";
import {
  PageHeaderTools,
  PageHeaderToolsProvider,
} from "../shell/page-header/page-header-tools";
import { PageContainer } from "../shell/page-shell";
import { AiHubCatalogControls } from "./ai-hub-catalog-controls";
import {
  AiHubHeader,
  type AiHubMode,
  aiHubHeaderThresholds,
} from "./ai-hub-header";
import { ConnectedProvidersStrip } from "./connected-providers-strip";
import { HubModalStack } from "./hub-modal-stack";
import { HubSkeleton } from "./hub-skeleton";
import { ModelFacets } from "./model-facets";
import { ModelResults } from "./model-results";
import { ProviderQuickFilterChips } from "./provider-quick-filter-chips";
import { ProvidersPane } from "./providers-pane";
import { useHubProviders } from "./use-hub-providers";
import { useModelFacetState } from "./use-model-facet-state";

const EMPTY_MODELS: CatalogModel[] = [];

/** Two-mode AI provider and model catalog with one shared query. */
export function AiHubView() {
  const { t } = useTranslation("aiHub");
  const { catalog, isLoading } = useHubCatalog();
  const connections = useProviderConnections();
  const [mode, setMode] = useState<AiHubMode>("providers");
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] =
    useState<ProviderQuickFilter>("all");
  const [openProvider, setOpenProvider] = useState<ProviderInfo | null>(null);
  const [openModel, setOpenModel] = useState<CatalogModel | null>(null);

  const providerGroups = useHubProviders(connections, catalog, query);
  const { owned, connectedMatches, availableMatches, searching } =
    providerGroups;
  const modelState = useModelFacetState(catalog?.models ?? EMPTY_MODELS, query);
  // Query narrowing came with `availableMatches`; the billing facet applies
  // here so the Available heading count and the grid can never disagree.
  const shownProviders = useMemo(
    () => filterByQuickFilter(availableMatches, providerFilter),
    [availableMatches, providerFilter],
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
          value: mode,
          label: t("sections.available"),
          content:
            mode === "providers" ? (
              <ProvidersPane
                providers={shownProviders}
                connections={connections}
                catalog={catalog}
                onOpen={setOpenProvider}
              />
            ) : (
              <ModelResults
                models={modelState.results}
                onOpenModel={(key) => {
                  const model = catalog.byKey.get(key);
                  if (model) setOpenModel(model);
                }}
                layout="grid"
              />
            ),
        },
      ]
    : null;

  return (
    <PageHeaderToolsProvider thresholds={aiHubHeaderThresholds(mode)}>
      <div className="flex h-full flex-col">
        <AiHubHeader active={mode} onSelect={setMode} />
        <div
          className={cn(
            "flex-1 [scrollbar-gutter:stable]",
            modalOpen ? "overflow-y-hidden" : "overflow-y-auto",
          )}
        >
          <PageContainer width="wide" className="pt-6 pb-10">
            <div className={cn("mx-auto w-full", CATALOG_PLANE_MAX_W)}>
              {!catalog || !tabs ? (
                <HubSkeleton loading={isLoading} />
              ) : (
                <>
                  <PageHeaderTools>
                    {(inStrip) => (
                      <AiHubCatalogControls
                        query={query}
                        onQueryChange={setQuery}
                        inStrip={inStrip}
                        facets={
                          mode === "models" ? (
                            <ModelFacets
                              {...modelState.facets}
                              compact={inStrip}
                            />
                          ) : (
                            <ProviderQuickFilterChips
                              filter={providerFilter}
                              onFilterChange={setProviderFilter}
                              compact={inStrip}
                            />
                          )
                        }
                      />
                    )}
                  </PageHeaderTools>
                  <CatalogShell
                    installedTitle={t("sections.connected")}
                    installedCount={
                      connections.ready
                        ? searching
                          ? connectedMatches.length
                          : owned.length
                        : undefined
                    }
                    availableTitle={t("sections.available")}
                    availableCount={
                      mode === "models"
                        ? modelState.results.length
                        : connections.ready
                          ? shownProviders.length
                          : undefined
                    }
                    installed={
                      connections.ready && connectedMatches.length > 0 ? (
                        <ConnectedProvidersStrip
                          providers={connectedMatches}
                          connectionState={connections.connectionState}
                          searching={searching}
                          onOpen={setOpenProvider}
                        />
                      ) : undefined
                    }
                    tabs={tabs}
                  />
                </>
              )}
            </div>
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
      </div>
    </PageHeaderToolsProvider>
  );
}
