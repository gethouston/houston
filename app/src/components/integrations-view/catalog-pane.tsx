import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/engine-adapter";
import type { ReactNode } from "react";
import type { ConnectFlow } from "../integrations";
import { CatalogSkeleton } from "./catalog-skeletons";
import { CategoryCatalog } from "./category-catalog";

export function CatalogPane({
  catalog,
  connections,
  surface,
  query,
  category,
  isLoading,
  connectFlow,
  onConnected,
  onRemove,
  onCuratedConnect,
  children,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  surface: string;
  query: string;
  category: string;
  isLoading: boolean;
  connectFlow: ConnectFlow;
  onConnected?: (toolkit: string) => void;
  onRemove: (toolkit: string) => void;
  onCuratedConnect?: (slug: string, providerConnect: () => void) => void;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-8">
      {children}

      {isLoading ? (
        <CatalogSkeleton />
      ) : (
        <CategoryCatalog
          catalog={catalog}
          connections={connections}
          connectFlow={connectFlow}
          onConnected={onConnected}
          surface={surface}
          query={query}
          category={category}
          onRemove={onRemove}
          onCuratedConnect={onCuratedConnect}
        />
      )}
    </div>
  );
}
