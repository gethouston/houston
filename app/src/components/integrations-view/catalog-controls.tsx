import { CatalogSearchField } from "@houston-ai/core";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  catalogCategorySlugs,
  categoryLabel,
  UNCATEGORIZED,
} from "../integrations";
import { FilterCombobox } from "../shell/filter-combobox";
import { HeaderSearch } from "../shell/page-header/header-search";

/**
 * The catalog surface's ONE controls row — the shared search field + the house
 * searchable category combobox (options A-Z, the uncategorized bucket labeled
 * "Other"). It sits ABOVE both sections of the {@link CatalogShell}; the surface
 * owns the `query` + `category` state and threads it through here, into the
 * installed-section filter, and into the discovery {@link CatalogPane}, so ONE
 * query narrows everything. Owned by the global Integrations page; the controls
 * live here so both of its catalog sections read from one row.
 */
export function CatalogControls({
  catalog,
  connections,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  addCustom,
  variant,
}: {
  catalog: IntegrationToolkit[];
  connections: IntegrationConnection[];
  query: string;
  onQueryChange: (value: string) => void;
  /** A primary-category slug, the `UNCATEGORIZED` bucket, or the "all" sentinel. */
  category: string;
  onCategoryChange: (value: string) => void;
  variant: "strip" | "row";
  addCustom?: ReactNode;
}) {
  const { t } = useTranslation("integrations");
  const categoryOptions = useMemo(() => {
    const connected = new Set(connections.map((c) => c.toolkit));
    return [
      { value: "custom", label: t("home.customCategory") },
      ...catalogCategorySlugs({ catalog, connected }).map((slug) => ({
        value: slug,
        label:
          slug === UNCATEGORIZED
            ? t("home.otherCategory")
            : categoryLabel(slug),
      })),
    ];
  }, [catalog, connections, t]);

  const inStrip = variant === "strip";
  return (
    <div className={inStrip ? "flex gap-2" : "mb-8 flex gap-2 pt-2"}>
      <HeaderSearch inStrip={inStrip}>
        <CatalogSearchField
          value={query}
          onChange={onQueryChange}
          label={t("home.searchPlaceholder")}
          clearLabel={t("home.clearSearch")}
          className={inStrip ? "[&_input]:h-8" : "w-full"}
        />
      </HeaderSearch>
      <FilterCombobox
        options={categoryOptions}
        value={category}
        onChange={onCategoryChange}
        allLabel={t("home.allCategories")}
        ariaLabel={t("home.categoryFilter")}
        searchPlaceholder={t("browse.searchCategories")}
        emptyText={t("browse.noCategoryResults")}
        searchable
        className={inStrip ? "h-8" : undefined}
      />
      {addCustom}
    </div>
  );
}
