import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useMemo, useState } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useProviderConnections } from "../../hooks/use-provider-connections";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types";
import { useHubCatalog } from "../../lib/ai-hub/use-hub-catalog";
import { newEngineActive } from "../../lib/engine";
import { osIsTauri } from "../../lib/os-bridge";
import {
  COMING_SOON_PROVIDERS,
  EMPTY_PROVIDER_CAPABILITIES,
  getConnectProviders,
  type ProviderInfo,
} from "../../lib/providers";
import { AiHubTabs, type HubTab } from "./ai-hub-tabs";
import { HubHero } from "./hub-hero";
import { ModelDetail } from "./model-detail";
import { ModelDirectory } from "./model-directory";
import { ProviderConnectionDialogs } from "./provider-connection-dialogs";
import { ProviderDetail } from "./provider-detail";
import { ProviderGrid } from "./provider-grid";

/**
 * Where in the hub the user is. The two roots (`providers` / `models`) carry the
 * hero + tabs; a drill-in (`provider` / `model`) fills the surface on its own.
 * `model.from` remembers the root or provider it was opened from so a single
 * back step returns there.
 */
type HubLocation =
  | { view: "providers" }
  | { view: "models" }
  | { view: "provider"; id: string }
  | { view: "model"; key: string; from: HubLocation };

const TRANSITION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const },
};

/**
 * The AI models hub: a top-level marketplace surface. Composes the masthead,
 * the Providers / Models tabs, and the two drill-in details, driven by
 * `useHubCatalog` (the model directory) and `useProviderConnections` (connect /
 * sign-out). The connect-dialog stack renders once here for every card and offer
 * row underneath.
 */
export function AiHubView() {
  const { catalog, isLoading } = useHubCatalog();
  const connections = useProviderConnections();
  const [location, setLocation] = useState<HubLocation>({ view: "providers" });

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

  const openProvider = (provider: ProviderInfo) =>
    setLocation({ view: "provider", id: provider.id });
  const openModel = (model: CatalogModel, from: HubLocation) =>
    setLocation({ view: "model", key: model.key, from });

  const isRoot = location.view === "providers" || location.view === "models";
  const activeTab: HubTab = location.view === "models" ? "models" : "providers";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-8 py-10">
        {!catalog ? (
          <HubSkeleton loading={isLoading} />
        ) : (
          <>
            {isRoot && (
              <>
                <HubHero modelCount={catalog.modelCount} />
                <AiHubTabs
                  active={activeTab}
                  modelCount={catalog.modelCount}
                  onSelect={(tab) => setLocation({ view: tab })}
                />
              </>
            )}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={locationKey(location)} {...TRANSITION}>
                {location.view === "providers" && (
                  <ProviderGrid
                    providers={connectProviders}
                    comingSoon={COMING_SOON_PROVIDERS}
                    connections={connections}
                    catalog={catalog}
                    onOpen={openProvider}
                  />
                )}
                {location.view === "models" && (
                  <ModelDirectory
                    catalog={catalog}
                    onOpenModel={(model) =>
                      openModel(model, { view: "models" })
                    }
                  />
                )}
                {location.view === "provider" &&
                  (() => {
                    const provider = connectProviders.find(
                      (p) => p.id === location.id,
                    );
                    if (!provider) return null;
                    const from = location;
                    return (
                      <ProviderDetail
                        provider={provider}
                        connections={connections}
                        catalog={catalog}
                        onBack={() => setLocation({ view: "providers" })}
                        onOpenModel={(key) => {
                          const model = catalog.byKey.get(key);
                          if (model) openModel(model, from);
                        }}
                      />
                    );
                  })()}
                {location.view === "model" &&
                  (() => {
                    const model = catalog.byKey.get(location.key);
                    if (!model) return null;
                    const from = location.from;
                    return (
                      <ModelDetail
                        model={model}
                        connections={connections}
                        onBack={() => setLocation(from)}
                        onOpenProvider={openProvider}
                      />
                    );
                  })()}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </div>
      <ProviderConnectionDialogs {...connections.dialogProps} />
    </div>
  );
}

/** A stable key per location so the transition swaps on any real navigation. */
function locationKey(location: HubLocation): string {
  switch (location.view) {
    case "provider":
      return `provider:${location.id}`;
    case "model":
      return `model:${location.key}`;
    default:
      return location.view;
  }
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
