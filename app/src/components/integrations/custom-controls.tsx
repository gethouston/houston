import { CatalogSearchField } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { HeaderSearch } from "../shell/page-header/header-search";

/**
 * The Custom mode's controls — its search + the Add button — in the same two
 * forms the catalog mode's controls draw ({@link CatalogControls}): a compact
 * strip cluster when the header holds the tools, the full-width row above the
 * Installed card when it does not. The page header decides which is honest for
 * the width; switching modes swaps like for like, so the search never appears
 * for one source and vanishes for the other.
 */
export function CustomControls({
  query,
  onQueryChange,
  addButton,
  variant,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  addButton: ReactNode;
  variant: "strip" | "row";
}) {
  const { t } = useTranslation("integrations");
  const inStrip = variant === "strip";
  return (
    <div
      className={
        inStrip
          ? "flex items-center gap-2"
          : "mb-8 flex items-center gap-2 pt-2"
      }
    >
      <HeaderSearch query={query} inStrip={inStrip}>
        <CatalogSearchField
          value={query}
          onChange={onQueryChange}
          label={t("custom.searchPlaceholder")}
          clearLabel={t("custom.clearSearch")}
          className={inStrip ? "[&_input]:h-8" : "w-full"}
        />
      </HeaderSearch>
      {addButton}
    </div>
  );
}
