import { useCallback, useMemo, useState } from "react";
import type { ModelPickerFilterState } from "./catalog";
import type {
  ModelCapabilityKey,
  ModelPickerSort,
  ModelPriceTier,
} from "./types";

/** Local UI state for the picker (query, rail selection, filters, sort, detail). */
export interface ModelPickerController {
  filter: ModelPickerFilterState;
  openDetailId: string | undefined;
  setQuery: (q: string) => void;
  setProvider: (id: string) => void;
  toggleFavOnly: () => void;
  toggleCap: (cap: ModelCapabilityKey) => void;
  togglePriceTier: (tier: ModelPriceTier) => void;
  setSort: (sort: ModelPickerSort) => void;
  clearFilters: () => void;
  toggleDetail: (id: string) => void;
  /** Any capability/price chip active — drives the filter button's dot. */
  hasActiveFilter: boolean;
}

export function useModelPicker(): ModelPickerController {
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const [caps, setCaps] = useState<ReadonlySet<ModelCapabilityKey>>(
    () => new Set(),
  );
  const [priceTiers, setPriceTiers] = useState<ReadonlySet<ModelPriceTier>>(
    () => new Set(),
  );
  const [sort, setSort] = useState<ModelPickerSort>("relevance");
  const [openDetailId, setOpenDetailId] = useState<string | undefined>();

  const toggleCap = useCallback((cap: ModelCapabilityKey) => {
    setCaps((prev) => toggled(prev, cap));
  }, []);
  const togglePriceTier = useCallback((tier: ModelPriceTier) => {
    setPriceTiers((prev) => toggled(prev, tier));
  }, []);
  const clearFilters = useCallback(() => {
    setCaps(new Set());
    setPriceTiers(new Set());
  }, []);
  const toggleFavOnly = useCallback(() => setFavOnly((v) => !v), []);
  const toggleDetail = useCallback(
    (id: string) => setOpenDetailId((cur) => (cur === id ? undefined : id)),
    [],
  );

  const filter = useMemo<ModelPickerFilterState>(
    () => ({ query, provider, favOnly, caps, priceTiers, sort }),
    [query, provider, favOnly, caps, priceTiers, sort],
  );

  return {
    filter,
    openDetailId,
    setQuery,
    setProvider,
    toggleFavOnly,
    toggleCap,
    togglePriceTier,
    setSort,
    clearFilters,
    toggleDetail,
    hasActiveFilter: caps.size > 0 || priceTiers.size > 0,
  };
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
