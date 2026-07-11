/**
 * The interaction half of `ChatModelSelector`: owns the popover open state and
 * the select handler, wires the "Connect more providers…" footer to the AI Hub,
 * and wraps the derived view-models (`usePickerViewModels`) into the single
 * object the container's JSX renders. Split from both the component and the
 * derivation hook so each stays under the file-size budget.
 */

import {
  cn,
  type ModelPickerLabels,
  type ModelPickerModel,
  type ModelPickerProvider,
} from "@houston-ai/core";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildLabels } from "../components/chat-model-selector-labels";
import { BrandMark } from "../components/provider-browser/brand-mark";
import { decodeModelPickerId } from "../lib/chat-model-picker-ids";
import { useUIStore } from "../stores/ui";
import { usePickerViewModels } from "./use-picker-view-models";

/** Everything `ChatModelSelector`'s JSX needs to render the picker. */
export interface ChatModelPicker {
  isOpen: boolean;
  setOpen: (next: boolean) => void;
  displayLabel: string;
  models: ModelPickerModel[];
  providers: ModelPickerProvider[];
  selectedId: string;
  catalogState: ReturnType<typeof usePickerViewModels>["catalogState"];
  labels: Partial<ModelPickerLabels>;
  onSelect: (id: string) => void;
  /** Opens the AI Hub, the app's provider-connection surface. */
  onConnectMore: () => void;
  renderProviderIcon: (providerId: string, className?: string) => ReactNode;
}

/**
 * Render a provider's colorful brand mark, the same treatment as
 * `FilterCombobox`'s option marks. `text-current!` re-inherits the brand color,
 * which the Command item's default `svg` rule would otherwise flatten to gray.
 */
function renderProviderIcon(providerId: string, className?: string): ReactNode {
  return (
    <BrandMark
      providerId={providerId}
      size="sm"
      className={cn("[&_svg]:text-current!", className)}
    />
  );
}

/**
 * Drive the chat model picker. `provider`/`model` are the current selection;
 * `open`/`onOpenChange` optionally control the popover (omit both to leave it
 * uncontrolled, matching the old dropdown's auto-close on pick).
 */
export function useChatModelPicker(opts: {
  provider: string;
  model: string;
  onSelect: (provider: string, model: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}): ChatModelPicker {
  const { provider, model, onSelect, open, onOpenChange } = opts;
  const { t } = useTranslation("chat");
  const setViewMode = useUIStore((s) => s.setViewMode);

  // Merge controlled + uncontrolled open so selecting a row closes the picker
  // even when no parent owns the state (the old dropdown auto-closed on pick).
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = open ?? uncontrolledOpen;
  const view = usePickerViewModels({ provider, model, isOpen });

  const setOpen = useCallback(
    (next: boolean) => {
      if (open === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );

  const handleSelect = useCallback(
    (id: string) => {
      const decoded = decodeModelPickerId(id);
      onSelect(decoded.provider, decoded.model);
      setOpen(false);
    },
    [onSelect, setOpen],
  );

  // "Connect more providers…" leaves chat for the AI Hub — the one surface that
  // lists every provider and owns the full connect flow (OAuth / api-key /
  // local). The per-provider inline connect cards are gone: disconnected
  // providers never appear in the picker anymore.
  const onConnectMore = useCallback(() => {
    setOpen(false);
    setViewMode("ai-hub");
  }, [setOpen, setViewMode]);

  const labels = useMemo<Partial<ModelPickerLabels>>(() => buildLabels(t), [t]);

  return {
    isOpen,
    setOpen,
    displayLabel: view.displayLabel,
    models: view.models,
    providers: view.providers,
    selectedId: view.selectedId,
    catalogState: view.catalogState,
    labels,
    onSelect: handleSelect,
    onConnectMore,
    renderProviderIcon,
  };
}
