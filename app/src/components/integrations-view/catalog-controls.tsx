import { CatalogSearchField } from "@houston-ai/core";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  catalogCategorySlugs,
  categoryLabel,
  UNCATEGORIZED,
} from "../integrations";
import { FilterCombobox } from "../shell/filter-combobox";

/**
 * The catalog surface's ONE controls row — the shared search field + the house
 * searchable category combobox (options A-Z, the uncategorized bucket labeled
 * "Other"). It sits ABOVE both sections of the {@link CatalogShell}; the surface
 * owns the `query` + `category` state and threads it through here, into the
 * installed-section filter, and into the discovery {@link CatalogPane}, so ONE
 * query narrows everything. Shared verbatim by the global Integrations page and
 * the per-agent Integrations tab so the controls never drift.
 */
export function CatalogControls({
  catalog,
  connections,
  query,
  onQueryChange,
  category,
  onCategoryChange,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  query: string;
  onQueryChange: (value: string) => void;
  /** A primary-category slug, the `UNCATEGORIZED` bucket, or the "all" sentinel. */
  category: string;
  onCategoryChange: (value: string) => void;
}) {
  const { t } = useTranslation("integrations");
  const categoryOptions = useMemo(() => {
    const connected = new Set(connections.map((c) => c.toolkit));
    return catalogCategorySlugs({ catalog, connected }).map((slug) => ({
      value: slug,
      label:
        slug === UNCATEGORIZED ? t("home.otherCategory") : categoryLabel(slug),
    }));
  }, [catalog, connections, t]);

  return (
    <div className="flex gap-2">
      <CatalogSearchField
        value={query}
        onChange={onQueryChange}
        label={t("home.searchPlaceholder")}
        className="flex-1"
      />
      <FilterCombobox
        options={categoryOptions}
        value={category}
        onChange={onCategoryChange}
        allLabel={t("home.allCategories")}
        ariaLabel={t("home.categoryFilter")}
        searchPlaceholder={t("browse.searchCategories")}
        emptyText={t("browse.noCategoryResults")}
        searchable
      />
    </div>
  );
}
