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
