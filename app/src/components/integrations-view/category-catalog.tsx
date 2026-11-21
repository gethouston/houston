import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/engine-adapter";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ConnectFlow } from "../integrations";
import { curatedIntegrationOf } from "../integrations/curated-integrations";
import { AppInfoDialog } from "./app-info-dialog";
import { CatalogCategorySection } from "./catalog-category-section";
import { useCatalogSections } from "./use-catalog-sections";

export function CategoryCatalog({
  catalog,
  connections,
  connectFlow,
  onConnected,
  surface,
  query,
  category,
  onRemove,
  onCuratedConnect,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  connectFlow: ConnectFlow;
  onConnected?: (toolkit: string) => void;
  surface: string;
  query: string;
  category: string;
  onRemove: (toolkit: string) => void;
  onCuratedConnect?: (slug: string, providerConnect: () => void) => void;
}) {
  const { t } = useTranslation("integrations");
  const { visible, owners, broken, expand } = useCatalogSections({
    catalog,
    connections,
    query,
    category,
    surface,
    origins: connectFlow.origins,
  });

  const [info, setInfo] = useState<{
    toolkit: IntegrationToolkit;
    origin: string;
  } | null>(null);
  const beginConnect = (toolkit: string, origin: string) => {
    void connectFlow.connect(toolkit, origin).then((attempt) => {
      if (attempt.outcome === "active") onConnected?.(toolkit);
    });
  };

  const requestConnect = (toolkit: string, origin: string) => {
    if (onCuratedConnect && curatedIntegrationOf(toolkit)) {
      onCuratedConnect(toolkit, () => beginConnect(toolkit, origin));
      return;
    }
    beginConnect(toolkit, origin);
  };

  return (
    <div>
      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          {t("picker.noResults")}
        </p>
      ) : (
        <div className="space-y-8">
          {visible.map((section) => (
            <CatalogCategorySection
              key={section.category}
              section={section}
              surface={surface}
              connectFlow={connectFlow}
              onConnect={requestConnect}
              owns={(slug, origin) => owners.get(slug) === origin}
              statusOf={(slug) => broken.get(slug)?.status}
              onOpen={(toolkit, origin) => setInfo({ toolkit, origin })}
              onExpand={expand}
            />
          ))}
        </div>
      )}

      <AppInfoDialog
        toolkit={info?.toolkit ?? null}
        broken={info ? broken.get(info.toolkit.slug) : undefined}
        onClose={() => setInfo(null)}
        onConnect={(toolkit) => {
          const origin = info?.origin;
          setInfo(null);
          if (origin) {
            requestConnect(toolkit, origin);
          }
        }}
        onRemove={(toolkit) => {
          setInfo(null);
          onRemove(toolkit);
        }}
        busy={info !== null && info.toolkit.slug in connectFlow.states}
      />
    </div>
  );
}
