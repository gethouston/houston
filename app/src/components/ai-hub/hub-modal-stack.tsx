/**
 * The AI hub's overlay stack: the provider detail modal, the model detail modal,
 * and the shared provider connect-dialog stack, rendered once above every hub
 * surface. Lifted out of {@link AiHubView} so the page stays a lean layout: it
 * owns the open-provider / open-model state and the last-shown retention (so
 * Radix keeps a modal mounted through its exit transition instead of snapping to
 * empty), while the page keeps only the boolean it needs to freeze its scroller.
 */

import { useRef } from "react";
import type { ProviderConnections } from "../../hooks/use-provider-connections";
import type { CatalogModel, HubCatalog } from "../../lib/ai-hub/catalog-types";
import type { ProviderInfo } from "../../lib/providers";
import { ProviderConnectionDialogs } from "../provider-browser/provider-connection-dialogs";
import { ModelModal } from "./model-modal";
import { ProviderModal } from "./provider-modal";

export function HubModalStack({
  catalog,
  connections,
  openProvider,
  setOpenProvider,
  openModel,
  setOpenModel,
}: {
  catalog: HubCatalog;
  connections: ProviderConnections;
  openProvider: ProviderInfo | null;
  setOpenProvider: (provider: ProviderInfo | null) => void;
  openModel: CatalogModel | null;
  setOpenModel: (model: CatalogModel | null) => void;
}) {
  // Retain the last provider/model while a modal animates out so Radix keeps it
  // mounted through the exit transition instead of snapping to empty.
  const lastProvider = useRef<ProviderInfo | null>(null);
  if (openProvider) lastProvider.current = openProvider;
  const providerForModal = openProvider ?? lastProvider.current;
  const lastModel = useRef<CatalogModel | null>(null);
  if (openModel) lastModel.current = openModel;
  const modelForModal = openModel ?? lastModel.current;

  return (
    <>
      {providerForModal && (
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
    </>
  );
}
