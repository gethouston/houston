import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/engine-adapter";
import { CatalogSearchField } from "@houston-ai/core";
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
  category: string;
  onCategoryChange: (value: string) => void;
  variant: "strip" | "row";
  customAvailable: boolean;
  addCustom?: ReactNode;
}) {
  const { t } = useTranslation("integrations");
  const categoryOptions = useMemo(() => {
    const connected = new Set(connections.map((c) => c.toolkit));
    return [
      ...(customAvailable
        ? [{ value: "custom", label: t("home.customCategory") }]
        : []),
      ...catalogCategorySlugs({ catalog, connected })
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
