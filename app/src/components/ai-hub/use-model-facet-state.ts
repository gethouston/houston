import { useDeferredValue, useMemo, useState } from "react";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types.ts";
import { filterModels, searchModels } from "../../lib/ai-hub/search.ts";
import type { FilterOption } from "../shell/filter-combobox.tsx";
import {
  type CostBucket,
  cheapestInput,
  costBucket,
  costTier,
  type GoodAt,
  labsInCatalog,
  type MemoryBucket,
  memoryBucket,
  type ProviderValue,
} from "./facets.ts";
import { labName } from "./format.ts";

export function useModelFacetState(models: CatalogModel[], query: string) {
  const [provider, setProvider] = useState<ProviderValue>("all");
  const [goodAt, setGoodAt] = useState<GoodAt>("all");
  const [cost, setCost] = useState<CostBucket>("all");
  const [memory, setMemory] = useState<MemoryBucket>("all");
  const deferredQuery = useDeferredValue(query);

  const labOptions = useMemo<FilterOption[]>(
    () =>
      labsInCatalog(models).map((lab) => ({
        value: lab,
        label: labName(lab),
        mark: lab,
      })),
    [models],
  );
  const results = useMemo(() => {
    const filtered = filterModels(models, {
      lab: provider === "all" ? undefined : provider,
      reasoning: goodAt === "reasoning",
      vision: goodAt === "images",
    })
      .filter(
        (model) =>
          goodAt !== "budget" || costTier(cheapestInput(model.offers)) === 1,
      )
      .filter((model) => cost === "all" || costBucket(model) === cost)
      .filter(
        (model) => memory === "all" || memoryBucket(model.context) === memory,
      );
    return searchModels(filtered, deferredQuery);
  }, [models, provider, goodAt, cost, memory, deferredQuery]);

  return {
    results,
    facets: {
      labOptions,
      provider,
      setProvider,
      goodAt,
      setGoodAt,
      cost,
      setCost,
      memory,
      setMemory,
    },
  };
}
