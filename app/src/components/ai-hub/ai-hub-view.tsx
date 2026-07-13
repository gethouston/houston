import { CatalogShell, type CatalogShellTab, cn } from "@houston-ai/core";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useProviderConnections } from "../../hooks/use-provider-connections";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types";
import { useHubCatalog } from "../../lib/ai-hub/use-hub-catalog";
import { newEngineActive } from "../../lib/engine";
import { isMultiplayer } from "../../lib/org-roles";
import { osIsTauri } from "../../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
  type ProviderInfo,
} from "../../lib/providers";
import { ProviderConnectionDialogs } from "../provider-browser/provider-connection-dialogs";
import { groupProviders } from "../provider-browser/provider-grouping";
import { PageContainer } from "../shell/page-shell";
import { AiHubPolicy } from "./ai-hub-policy";
import { ConnectedProvidersStrip } from "./connected-providers-strip";
import { HubHero } from "./hub-hero";
import { HubSkeleton } from "./hub-skeleton";
import { ModelDirectory } from "./model-directory";
import { ModelModal } from "./model-modal";
import { ProviderModal } from "./provider-modal";
import { ProvidersPane } from "./providers-pane";

/**
 * The AI models hub: a top-level marketplace surface in the shared
 * {@link CatalogShell} grammar (the same layout as the Integrations page) —
 * the hero, then the consolidated **Connected** strip of provider brand tiles
 * OUTSIDE the tabs (a tile opens that provider's modal), then the discovery
 * tabs with live count chips: **Providers** ({@link ProvidersPane}: the
 * not-yet-connected catalog), **Models** (the cross-provider directory) and,
 * on Teams, **Workspace policy**. A provider row/tile or model row opens a
 * centered MODAL (`ProviderModal` / `ModelModal`); the connect-dialog stack
 * renders once here for every surface underneath.
 */
export function AiHubView() {
  const { t } = useTranslation("aiHub");
  const { catalog, isLoading } = useHubCatalog();
  const connections = useProviderConnections();
  const [tab, setTab] = useState("providers");
  const [openProvider, setOpenProvider] = useState<ProviderInfo | null>(null);
  const [openModel, setOpenModel] = useState<CatalogModel | null>(null);

  const { capabilities } = useCapabilities();
  const newEngine = newEngineActive();
  // Teams owner/admin only reach the hub (plain members lose its nav), so the
  // workspace model-policy tab shows whenever this is a Teams deployment.
  const showPolicy =
    isMultiplayer(capabilities) && capabilities?.teams === true;
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

  // While a modal is up, freeze the page scroller behind it. Radix's scroll
  // lock only locks <body>; this inner region kept its own live scrollbar,
  // which sat next to the modal's as a second, draggable vertical scroll.
  // Hidden boxes are still scroll containers, so `scrollbar-gutter: stable`
  // keeps the gutter reserved and the scroll offset holds.
  const modalOpen = openProvider !== null || openModel !== null;

  // Retain the last provider/model while a modal animates out so Radix keeps it
  // mounted through the exit transition instead of snapping to empty.
  const lastProvider = useRef<ProviderInfo | null>(null);
  if (openProvider) lastProvider.current = openProvider;
  const providerForModal = openProvider ?? lastProvider.current;
  const lastModel = useRef<CatalogModel | null>(null);
  if (openModel) lastModel.current = openModel;
  const modelForModal = openModel ?? lastModel.current;

  const tabs: CatalogShellTab[] | null = catalog
    ? [
        {
          value: "providers",
          label: t("tabs.providers"),
          count: connections.ready ? available.length : undefined,
          content: (
            <ProvidersPane
              providers={available}
              connections={connections}
              catalog={catalog}
              onOpen={setOpenProvider}
            />
          ),
        },
        {
          value: "models",
          label: t("tabs.models"),
          count: catalog.modelCount,
          content: (
            <ModelDirectory
              catalog={catalog}
              onOpenModel={(key) => {
                const model = catalog.byKey.get(key);
                if (model) setOpenModel(model);
              }}
            />
          ),
        },
        ...(showPolicy
          ? [
              {
                value: "policy",
                label: t("tabs.policy"),
                content: <AiHubPolicy />,
              },
            ]
          : []),
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
              installedTitle={t("sections.connected")}
              installedCount={connections.ready ? connected.length : undefined}
              installed={
                connections.ready && connected.length > 0 ? (
                  <ConnectedProvidersStrip
                    providers={connected}
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

      {providerForModal && catalog && (
        <ProviderModal
          provider={providerForModal}
          open={openProvider != null}
          connections={connections}
          catalog={catalog}
          onClose={() => setOpenProvider(null)}
          onOpenModel={(key) => {
            setOpenProvider(null);
            const model = catalog.byKey.get(key);
            if (model) setOpenModel(model);
          }}
        />
      )}
      {modelForModal && (
        <ModelModal
          model={modelForModal}
          open={openModel != null}
          connections={connections}
          onClose={() => setOpenModel(null)}
          onOpenProvider={(provider) => {
            setOpenModel(null);
            setOpenProvider(provider);
          }}
        />
      )}
      <ProviderConnectionDialogs {...connections.dialogProps} />
    </div>
  );
}
