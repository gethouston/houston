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
import {
  HeaderToolsRow,
  headerSearchFieldClass,
} from "../shell/page-header/header-tools-row";

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
  customAvailable,
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
  /** Whether the host serves custom integrations (gates the pinned entry). */
  customAvailable: boolean;
  addCustom?: ReactNode;
}) {
  const { t } = useTranslation("integrations");
  const categoryOptions = useMemo(() => {
    const connected = new Set(connections.map((c) => c.toolkit));
    return [
      // Pinned only where the host serves custom integrations — offering the
      // slice on a host that cannot hold custom rows is a guaranteed dead end.
      ...(customAvailable
        ? [{ value: "custom", label: t("home.customCategory") }]
        : []),
      ...catalogCategorySlugs({ catalog, connected })
        // A remote catalog category slugged "custom" would duplicate the
        // pinned entry and hijack its filter branch; the sentinel owns the id.
        .filter((slug) => slug !== "custom")
        .map((slug) => ({
          value: slug,
          label:
            slug === UNCATEGORIZED
              ? t("home.otherCategory")
              : categoryLabel(slug),
        })),
    ];
  }, [catalog, connections, customAvailable, t]);

  const inStrip = variant === "strip";
  return (
    <HeaderToolsRow
      inStrip={inStrip}
      search={
        <CatalogSearchField
          value={query}
          onChange={onQueryChange}
          label={t("home.searchPlaceholder")}
          clearLabel={t("home.clearSearch")}
          className={headerSearchFieldClass(inStrip)}
        />
      }
    >
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
    </HeaderToolsRow>
  );
}
