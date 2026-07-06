import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useProviderConnections } from "../../hooks/use-provider-connections";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types";
import { useHubCatalog } from "../../lib/ai-hub/use-hub-catalog";
import { newEngineActive } from "../../lib/engine";
import { osIsTauri } from "../../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
  type ProviderInfo,
} from "../../lib/providers";
import { AiHubTabs, type HubTab } from "./ai-hub-tabs";
import { HubHero } from "./hub-hero";
import { ModelDirectory } from "./model-directory";
import { ModelModal } from "./model-modal";
import { ProviderConnectionDialogs } from "./provider-connection-dialogs";
import { ProviderGrid } from "./provider-grid";
import { ProviderModal } from "./provider-modal";

const TRANSITION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const },
};

/**
 * The AI models hub: a top-level marketplace surface. Composes the masthead, the
 * Providers / Models tabs, and the two surfaces (provider grid + model ledger),
 * driven by `useHubCatalog` (the model directory) and `useProviderConnections`
 * (connect / sign-out). A provider card or model row opens a centered MODAL
 * (`ProviderModal` / `ModelModal`) that fades in over a single dim scrim — the
 * page stays put (no recede/blur). The connect-dialog stack renders once here
 * for every card and offer row underneath.
 */
export function AiHubView() {
  const { catalog, isLoading } = useHubCatalog();
  const connections = useProviderConnections();
  const [tab, setTab] = useState<HubTab>("providers");
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

  // Retain the last provider/model while a modal animates out so Radix keeps it
  // mounted through the exit transition instead of snapping to empty.
  const lastProvider = useRef<ProviderInfo | null>(null);
  if (openProvider) lastProvider.current = openProvider;
  const providerForModal = openProvider ?? lastProvider.current;
  const lastModel = useRef<CatalogModel | null>(null);
  if (openModel) lastModel.current = openModel;
  const modelForModal = openModel ?? lastModel.current;

  return (
    <div className="flex h-full flex-col">
      {!catalog ? (
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-8 py-10">
          <HubSkeleton loading={isLoading} />
        </div>
      ) : (
        <>
          {/* Fixed masthead: the hero title + tabs never scroll away. No
              background of its own — it's a non-overlapping flex sibling of the
              scroll region below (nothing renders behind it), so it inherits the
              `.canvas-screen` glass. An opaque `bg-background` here painted a
              solid slab that broke the frosted-glass screen in dark mode (the
              aurora bleeds through everywhere else). */}
          <div className="shrink-0">
            <div className="mx-auto flex max-w-5xl flex-col gap-6 px-8 pt-10 pb-4">
              <HubHero modelCount={catalog.modelCount} />
              <AiHubTabs
                active={tab}
                providerCount={connectProviders.length}
                modelCount={catalog.modelCount}
                onSelect={setTab}
              />
            </div>
          </div>

          {/* Only this region scrolls. `scrollbar-gutter: stable` reserves the
              scrollbar's gutter permanently, so when a modal's scroll-lock
              (react-remove-scroll) removes the scrollbar the content width never
              changes — the grid stays put on modal open. The ModelsBrowser
              controls/column-header (sticky top-0) pin to the TOP of this
              region, i.e. right beneath the fixed tabs above. */}
          <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
            <div className="mx-auto flex max-w-5xl flex-col px-8 pb-10">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={tab} {...TRANSITION}>
                  {tab === "providers" ? (
                    <ProviderGrid
                      providers={connectProviders}
                      connections={connections}
                      catalog={catalog}
                      onOpen={setOpenProvider}
                    />
                  ) : (
                    <ModelDirectory
                      catalog={catalog}
                      onOpenModel={(key) => {
                        const model = catalog.byKey.get(key);
                        if (model) setOpenModel(model);
                      }}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </>
      )}

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

/**
 * A calm placeholder while the local catalog resolves. It loads from bundled
 * JSON so this flashes only for a frame; nothing flashy, just three muted bars.
 */
function HubSkeleton({ loading }: { loading: boolean }): ReactNode {
  if (!loading) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="h-8 w-40 rounded-lg bg-secondary" />
      <div className="h-4 w-2/3 rounded-lg bg-secondary" />
      <div className="mt-4 h-9 w-56 rounded-full bg-secondary" />
    </div>
  );
}
