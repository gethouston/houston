/**
 * The chat model picker's user-facing strings, translated from the `chat`
 * namespace. Split from `chat-model-selector.tsx` so the container stays under
 * the file-size budget; the mapping from i18n keys to `ModelPickerLabels` is the
 * only thing here.
 */

import type { ModelPickerLabels } from "@houston-ai/core";
import type { useTranslation } from "react-i18next";

/** Build the picker's labels from the chat-namespace translator. */
export function buildLabels(
  t: ReturnType<typeof useTranslation<"chat">>[0],
): Partial<ModelPickerLabels> {
  const k = (key: string) => t(`modelSelector.picker.${key}`);
  return {
    searchPlaceholder: k("searchPlaceholder"),
    recent: k("recent"),
    favorites: k("favorites"),
    results: k("results"),
    all: k("all"),
    connected: k("connected"),
    notConnected: k("notConnected"),
    connect: k("connect"),
    sort: k("sort"),
    sortRelevance: k("sortRelevance"),
    sortPrice: k("sortPrice"),
    sortContext: k("sortContext"),
    sortNewest: k("sortNewest"),
    filters: k("filters"),
    capabilities: k("capabilities"),
    price: k("price"),
    clearFilters: k("clearFilters"),
    favoritesOnly: k("favoritesOnly"),
    free: k("free"),
    priceFree: k("priceFree"),
    priceLow: k("priceLow"),
    priceMid: k("priceMid"),
    priceHigh: k("priceHigh"),
    empty: k("empty"),
    emptyHint: k("emptyHint"),
    loading: k("loading"),
    offline: k("offline"),
    capVision: k("capVision"),
    capReasoning: k("capReasoning"),
    capTools: k("capTools"),
    capImageGen: k("capImageGen"),
    detailContext: k("detailContext"),
    detailCapabilities: k("detailCapabilities"),
    contextLow: k("contextLow"),
    contextMedium: k("contextMedium"),
    contextHigh: k("contextHigh"),
    model: k("model"),
    models: k("models"),
    selected: k("selected"),
    keyboardHint: k("keyboardHint"),
  };
}
