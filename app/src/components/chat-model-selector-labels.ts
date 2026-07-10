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
    connectMore: k("connectMore"),
    back: k("back"),
    providersLabel: k("providersLabel"),
    modelsLabel: k("modelsLabel"),
    loading: k("loading"),
    empty: k("empty"),
    noProviders: k("noProviders"),
  };
}
