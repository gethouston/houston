import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type ConnectFlow,
  catalogCategorySlugs,
  categoryLabel,
  type PermissionsFix,
  type RecoveringAppRow,
  UNCATEGORIZED,
} from "../integrations";
import { FilterCombobox } from "../shell/filter-combobox";
import { CatalogSearchField } from "./catalog-search-field";
import { CategoryCatalog } from "./category-catalog";
import { RecoveryRow } from "./recovery-row";

/**
 * The Integrations tab of a catalog surface — shared VERBATIM by the global
 * page and the per-agent Integrations tab: a controls row (search + the house
 * searchable category combobox, options A-Z) over interrupted-OAuth recovery
 * rows, any surface-specific `children` (the agent tab's disallowed-apps
 * section), and the grouped category catalog. Search and category are LOCAL
 * to this tab (the custom tab owns its own search); the Installed strip lives
 * ABOVE the tabs (it consolidates both sources), and the connect flow stays
 * on the surface so switching tabs never kills an in-flight OAuth poll. On a
 * Teams host `allowlist` renders blocked apps as locked rows; `readOnly` (a
 * viewer without edit rights) keeps recovery rows visible but action-less.
 */
export function CatalogPane({
  catalog,
  connections,
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
  const { t } = useTranslation("integrations");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  // The combobox's options: the catalog's primary categories A-Z, the
  // uncategorized bucket labeled "Other" (the combobox owns the "all" row).
  const categoryOptions = useMemo(() => {
    const connected = new Set(connections.map((c) => c.toolkit));
    return catalogCategorySlugs({ catalog, connected }).map((slug) => ({
      value: slug,
      label:
        slug === UNCATEGORIZED ? t("home.otherCategory") : categoryLabel(slug),
    }));
  }, [catalog, connections, t]);

  return (
    <div className="space-y-8">
      <div className="flex gap-2">
        <CatalogSearchField
          value={query}
          onChange={setQuery}
          label={t("home.searchPlaceholder")}
          className="flex-1"
        />
        <FilterCombobox
          options={categoryOptions}
          value={category}
          onChange={setCategory}
          allLabel={t("home.allCategories")}
          ariaLabel={t("home.categoryFilter")}
          searchPlaceholder={t("browse.searchCategories")}
          emptyText={t("browse.noCategoryResults")}
          searchable
        />
      </div>

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
