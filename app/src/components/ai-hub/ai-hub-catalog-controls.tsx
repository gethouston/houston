import { CatalogSearchField } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { HeaderSearch } from "../shell/page-header/header-search";

export function AiHubCatalogControls({
  query,
  onQueryChange,
  inStrip,
  facets,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  inStrip: boolean;
  facets?: ReactNode;
}) {
  const { t } = useTranslation("aiHub");

  return (
    <div className={inStrip ? "flex gap-2" : "mb-8 flex flex-wrap gap-2 pt-2"}>
      <HeaderSearch inStrip={inStrip}>
        <CatalogSearchField
          value={query}
          onChange={onQueryChange}
          label={t("search.placeholder")}
          clearLabel={t("search.clear")}
          className={inStrip ? "[&_input]:h-8" : "w-full"}
        />
      </HeaderSearch>
      {facets}
    </div>
  );
}
