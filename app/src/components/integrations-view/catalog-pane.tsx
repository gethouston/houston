import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import type { ReactNode } from "react";
import type { ConnectFlow, PermissionsFix } from "../integrations";
import { CatalogSkeleton } from "./catalog-skeletons";
import { CategoryCatalog } from "./category-catalog";

/**
 * The Integrations tab of a catalog surface — shared VERBATIM by the global
 * page and the per-agent Integrations tab: any surface-specific `children` (the
 * agent tab's disallowed-apps section) over the grouped category catalog. It is
 * CONTROLLED: the surface owns the ONE search + category (its `controls` row
 * above BOTH sections) and threads them in as `query` + `category`, so the same
 * filter narrows this discovery area and the Installed strip together (the
 * custom tab keeps its own internal search). The connect flow is app-wide
 * shared state, so switching tabs (or leaving the surface entirely) never kills
 * an in-flight OAuth poll.
 *
 * There is NO recovery section at the top of the pane: an app whose connection
 * is pending or errored stays in its own category rows, wearing its status, and
 * is finished or removed from there. On a Teams host `allowlist` renders blocked
 * apps as locked rows. While the data settles it shows the
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
  onRemove,
  allowlist = null,
  lockedFix,
  children,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  /** Which surface these rows belong to (the global page vs. one agent's tab),
   *  half of each row's connect-flow origin key. */
  surface: string;
  /** The surface's shared search query (from its one controls row). */
  query: string;
  /** The surface's shared category pick: a primary slug, `UNCATEGORIZED`, or
   *  the "all" sentinel. */
  category: string;
  isLoading: boolean;
  connectFlow: ConnectFlow;
  /** Disconnect an app's half-made connection (the app modal's Remove). */
  onRemove: (toolkit: string) => void;
  /** The Teams effective allowlist (`null` = unrestricted, no locks ever). */
  allowlist?: string[] | null;
  /** Role-aware "Enable it in Permissions" resolver for locked rows (a viewer
   *  who can lift the ceiling); absent = the read-only member view. */
  lockedFix?: PermissionsFix;
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
          surface={surface}
          query={query}
          category={category}
          onRemove={onRemove}
          allowlist={allowlist}
          lockedFix={lockedFix}
        />
      )}
    </div>
  );
}
