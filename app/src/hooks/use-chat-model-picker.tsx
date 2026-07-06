/**
 * The interaction half of `ChatModelSelector`: owns the popover open state and
 * the select / connect / favorite handlers, and wraps the derived view-models
 * (`usePickerViewModels`) into the single object the container's JSX renders.
 * Split from both the component and the derivation hook so each stays under the
 * file-size budget.
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
import { ProviderGlyph } from "../components/shell/provider-logos";
import { decodeModelPickerId } from "../lib/chat-model-picker-ids";
import {
  getConnectProviders,
  getProvider,
  providerGatewayIds,
} from "../lib/providers";
import { useModelFavorites } from "./use-model-favorites";
import {
  type PickerConnectContext,
  usePickerViewModels,
} from "./use-picker-view-models";
import { useProviderConnections } from "./use-provider-connections";

/** Everything `ChatModelSelector`'s JSX needs to render the picker. */
export interface ChatModelPicker {
  isOpen: boolean;
  setOpen: (next: boolean) => void;
  displayLabel: string;
  models: ModelPickerModel[];
  providers: ModelPickerProvider[];
  favorites: string[];
  recents: string[];
  selectedId: string;
  catalogState: ReturnType<typeof usePickerViewModels>["catalogState"];
  labels: Partial<ModelPickerLabels>;
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => Promise<void>;
  onConnect: (providerId: string) => void;
  renderProviderIcon: (providerId: string, className?: string) => ReactNode;
  dialogProps: ReturnType<typeof useProviderConnections>["dialogProps"];
}

/** Render a provider's glyph in a square, size-following wrapper. */
function renderProviderIcon(providerId: string, className?: string): ReactNode {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center [&_svg]:size-full",
        className,
      )}
    >
      <ProviderGlyph providerId={providerId} />
    </span>
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
  const { favorites, recents, toggleFavorite, pushRecent } =
    useModelFavorites();
  const connections = useProviderConnections();

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
      void pushRecent(id);
      setOpen(false);
    },
    [onSelect, pushRecent, setOpen],
  );

  // Reuse the AI Hub's connect flow (OAuth / api-key / local dialogs). The two
  // OpenCode gateways collapse into one merged account whose key fans out to
  // both, so map the picker's per-gateway id back to that connect card.
  const connect = connections.connect;
  const ctx = view.connectContext;
  const handleConnect = useCallback(
    (providerId: string) => {
      const target = resolveConnectTarget(providerId, ctx);
      if (target) connect(target);
    },
    [connect, ctx],
  );

  const labels = useMemo<Partial<ModelPickerLabels>>(() => buildLabels(t), [t]);

  return {
    isOpen,
    setOpen,
    displayLabel: view.displayLabel,
    models: view.models,
    providers: view.providers,
    favorites,
    recents,
    selectedId: view.selectedId,
    catalogState: view.catalogState,
    labels,
    onSelect: handleSelect,
    onToggleFavorite: toggleFavorite,
    onConnect: handleConnect,
    renderProviderIcon,
    dialogProps: connections.dialogProps,
  };
}

/** Map a picker gateway id back to the connect card that authenticates it. */
function resolveConnectTarget(
  providerId: string,
  ctx: PickerConnectContext,
): ReturnType<typeof getProvider> {
  const connectProviders = getConnectProviders({
    newEngine: ctx.newEngine,
    desktop: ctx.desktop,
    capabilities: ctx.providerCapabilities,
  });
  return (
    connectProviders.find((p) => providerGatewayIds(p).includes(providerId)) ??
    getProvider(providerId)
  );
}
