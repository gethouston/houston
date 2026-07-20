import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import type { ReactNode } from "react";
import type {
  ConnectFlow,
  PermissionsFix,
  RecoveringAppRow,
} from "../integrations";
import { CategoryCatalog } from "./category-catalog";
import { RecoveryRow } from "./recovery-row";

/**
 * The Integrations tab of a catalog surface — shared VERBATIM by the global
 * page and the per-agent Integrations tab: interrupted-OAuth recovery rows, any
 * surface-specific `children` (the agent tab's disallowed-apps section), and the
 * grouped category catalog. It is CONTROLLED: the surface owns the ONE search +
 * category (its `controls` row above BOTH sections) and threads them in as
 * `query` + `category`, so the same filter narrows this discovery area and the
 * Installed strip together (the custom tab keeps its own internal search). The
 * connect flow stays on the surface so switching tabs never kills an in-flight
 * OAuth poll. On a Teams host `allowlist` renders blocked apps as locked rows;
 * `readOnly` (a viewer without edit rights) keeps recovery rows visible but
 * action-less.
 */
export function CatalogPane({
  catalog,
  connections,
  query,
  category,
  recovering,
  isLoading,
  connectFlow,
  onRemoveRecovering,
  allowlist = null,
  lockedFix,
  readOnly = false,
  children,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  /** The surface's shared search query (from its one controls row). */
  query: string;
  /** The surface's shared category pick: a primary slug, `UNCATEGORIZED`, or
   *  the "all" sentinel. */
  category: string;
  /** Pending / errored connections, shown as quiet recovery rows. */
  recovering: RecoveringAppRow[];
  isLoading: boolean;
  connectFlow: ConnectFlow;
  onRemoveRecovering: (toolkit: string) => void;
  /** The Teams effective allowlist (`null` = unrestricted, no locks ever). */
  allowlist?: string[] | null;
  /** Role-aware "Enable it in Permissions" resolver for locked rows (a viewer
   *  who can lift the ceiling); absent = the read-only member view. */
  lockedFix?: PermissionsFix;
  /** Viewer without edit rights: recovery rows lose their actions. */
  readOnly?: boolean;
  /** Surface-specific sections between recovery and the catalog. */
  children?: ReactNode;
}) {
  return (
    <div className="space-y-8">
      {recovering.length > 0 && (
        <div className="space-y-2">
          {recovering.map((row) => (
            <RecoveryRow
              key={row.connection.connectionId}
              row={row}
              connectFlow={connectFlow}
              onRemove={() => onRemoveRecovering(row.connection.toolkit)}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}

      {children}

      {isLoading ? (
        <CatalogSkeleton />
      ) : (
        <CategoryCatalog
          catalog={catalog}
          connections={connections}
          connectFlow={connectFlow}
          query={query}
          category={category}
          allowlist={allowlist}
          lockedFix={lockedFix}
        />
      )}
    </div>
  );
}

/**
 * A light placeholder standing in for the category catalog while the
 * connections + toolkit catalog settle: a few text bars. Decorative only, so
 * it is `aria-hidden`.
 */
function CatalogSkeleton() {
  return (
    <div aria-hidden className="space-y-3">
      <div className="h-4 w-32 animate-pulse rounded bg-chip" />
      <div className="h-4 w-full max-w-md animate-pulse rounded bg-chip" />
      <div className="h-4 w-full max-w-sm animate-pulse rounded bg-chip" />
    </div>
  );
}
