import {
  cn,
  type ModelPickerLabels,
  type ModelPickerModel,
  type ModelPickerProvider,
} from "@houston-ai/core";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildLabels,
  pickerEmptyState,
} from "../components/chat-model-selector-labels";
import { BrandMark } from "../components/provider-browser/brand-mark";
import { decodeModelPickerId } from "../lib/chat-model-picker-ids";
import { isTeamWorkspace } from "../lib/space-id";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { useCapabilities } from "./use-capabilities";
import { usePickerViewModels } from "./use-picker-view-models";

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
  onConnectMore?: () => void;
  renderProviderIcon: (providerId: string, className?: string) => ReactNode;
}

function renderProviderIcon(providerId: string, className?: string): ReactNode {
  return (
    <BrandMark
      providerId={providerId}
      size="sm"
      className={cn("[&_svg]:text-current!", className)}
    />
  );
}

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
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const { variant: emptyState, canConnect: canConnectProviders } =
    pickerEmptyState({
      teamSpace: workspaceId ? isTeamWorkspace(workspaceId) : false,
      capabilities,
      capabilitiesLoaded: !capabilitiesLoading,
    });

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

  const goToAiHub = useCallback(() => {
    setOpen(false);
    setViewMode("ai-hub");
  }, [setOpen, setViewMode]);
  const onConnectMore = canConnectProviders ? goToAiHub : undefined;

  const labels = useMemo<Partial<ModelPickerLabels>>(
    () => buildLabels(t, emptyState),
    [t, emptyState],
  );

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
