import { CatalogSearchField, cn } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import { fewModels, roundedModelCount } from "./format.ts";
import { ModelFacets } from "./model-facets.tsx";
import { ModelResults } from "./model-results.tsx";
import { useModelFacetState } from "./use-model-facet-state.ts";

/** Self-contained model browser used by modal and allowlist surfaces. */
export function ModelsBrowser({
  models,
  onOpenModel,
  query: controlledQuery,
  layout = "list",
  className,
}: {
  models: CatalogModel[];
  onOpenModel: (key: string) => void;
  query?: string;
  layout?: "list" | "grid";
  className?: string;
}) {
  const { t } = useTranslation("aiHub");
  const controlled = controlledQuery !== undefined;
  const [internalQuery, setInternalQuery] = useState("");
  const query = controlled ? controlledQuery : internalQuery;
  const state = useModelFacetState(models, query);
  const searchPlaceholder = fewModels(models.length)
    ? t("directory.searchFew")
    : t("directory.search", { count: roundedModelCount(models.length) });

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-2">
        {!controlled && (
          <CatalogSearchField
            value={internalQuery}
            onChange={setInternalQuery}
            label={searchPlaceholder}
            clearLabel={t("providerModal.clearSearch")}
          />
        )}
        <ModelFacets {...state.facets} />
      </div>
      <ModelResults
        models={state.results}
        onOpenModel={onOpenModel}
        layout={layout}
      />
    </div>
  );
}
