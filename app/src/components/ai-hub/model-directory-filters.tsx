/**
 * The models ledger filter bar: two calm dropdowns. "AI provider" narrows to a
 * single lab present in the catalog; "Good at" picks one facet (all / reasoning
 * / images / budget). Both are single-select and token-styled to sit quietly
 * beside the search box. Filter state lives in the parent; this stays thin,
 * owning only the catalog-lab derivation. The "AI provider" dropdown hides
 * itself when the models are all one lab (a single, useless option) — e.g. a
 * subscription provider's modal; "Good at" always shows.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";
import { type Dispatch, type SetStateAction, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogModel, LabId } from "../../lib/ai-hub/catalog-types.ts";
import { labName, labsInCatalog } from "./format.ts";

/** The single "Good at" facet in effect. `all` clears the facet. */
export type GoodAt = "all" | "reasoning" | "images" | "budget";

/** The "AI provider" selection: a catalog lab, or `all` for every lab. */
export type ProviderValue = LabId | "all";

const TRIGGER =
  "h-9 rounded-full border-border bg-secondary px-4 text-[13px] font-medium text-foreground shadow-none data-[placeholder]:text-muted-foreground focus-visible:ring-2";

export function DirectoryFilters({
  models,
  provider,
  setProvider,
  goodAt,
  setGoodAt,
}: {
  models: readonly CatalogModel[];
  provider: ProviderValue;
  setProvider: Dispatch<SetStateAction<ProviderValue>>;
  goodAt: GoodAt;
  setGoodAt: Dispatch<SetStateAction<GoodAt>>;
}) {
  const { t } = useTranslation("aiHub");
  const labs = useMemo(() => labsInCatalog(models), [models]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {labs.length > 1 && (
        <Select
          value={provider}
          onValueChange={(value) => setProvider(value as ProviderValue)}
        >
          <SelectTrigger
            className={TRIGGER}
            aria-label={t("directory.filters.provider")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {t("directory.filters.allProviders")}
            </SelectItem>
            {labs.map((lab) => (
              <SelectItem key={lab} value={lab}>
                {labName(lab)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={goodAt}
        onValueChange={(value) => setGoodAt(value as GoodAt)}
      >
        <SelectTrigger
          className={TRIGGER}
          aria-label={t("directory.filters.goodAt")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("directory.filters.all")}</SelectItem>
          <SelectItem value="reasoning">
            {t("directory.filters.reasoning")}
          </SelectItem>
          <SelectItem value="images">
            {t("directory.filters.images")}
          </SelectItem>
          <SelectItem value="budget">
            {t("directory.filters.budget")}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
