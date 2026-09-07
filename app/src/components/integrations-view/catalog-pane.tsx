import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import type { ReactNode } from "react";
import type { ConnectFlow } from "../integrations";
import { CatalogSkeleton } from "./catalog-skeletons";
import { CategoryCatalog } from "./category-catalog";

/**
 * The Integrations tab of a catalog surface: any surface-specific `children`
 * over the grouped category catalog. It is
 * CONTROLLED: the surface owns the ONE search + category (its `controls` row
 * above BOTH sections) and threads them in as `query` + `category`, so the same
 * filter narrows this discovery area and every row in the Installed strip.
 * The connect flow is app-wide shared state, so leaving the surface never
 * kills an in-flight OAuth poll.
 *
 * There is NO recovery section at the top of the pane: an app whose connection
 * is pending or errored stays in its own category rows, wearing its status, and
 * is finished or removed from there. While the data settles it shows the
 * {@link CatalogSkeleton}, which mirrors the grouped catalog it replaces so
 * resolving costs no layout shift.
 */
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
  /** Which surface these rows belong to, half of each row's connect-flow
   *  origin key. */
  surface: string;
  /** The surface's shared search query (from its one controls row). */
  query: string;
  /** The surface's shared category pick: a primary slug, `UNCATEGORIZED`, or
   *  the "all" sentinel. */
  category: string;
  isLoading: boolean;
  connectFlow: ConnectFlow;
  onConnected?: (toolkit: string) => void;
  /** Disconnect an app's half-made connection (the app modal's Remove). */
  onRemove: (toolkit: string) => void;
  /** Curated entry pressed — the surface opens its dedicated connect dialog. */
  onCuratedConnect?: (slug: string, providerConnect: () => void) => void;
  /** Surface-specific sections above the catalog. */
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
