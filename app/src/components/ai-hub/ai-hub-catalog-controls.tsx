import { CatalogSearchField } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  HeaderToolsRow,
  headerSearchFieldClass,
} from "../shell/page-header/header-tools-row";

export function AiHubCatalogControls({
  query,
  onQueryChange,
  inStrip,
  facets,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  inStrip: boolean;
  /** The active mode's filters (billing chips / model facets). */
  facets?: ReactNode;
}) {
  const { t } = useTranslation("aiHub");

  return (
    <HeaderToolsRow
      inStrip={inStrip}
      search={
        <CatalogSearchField
          value={query}
          onChange={onQueryChange}
          label={t("search.placeholder")}
          clearLabel={t("search.clear")}
          className={headerSearchFieldClass(inStrip)}
        />
      }
    >
      {facets}
    </HeaderToolsRow>
  );
}
