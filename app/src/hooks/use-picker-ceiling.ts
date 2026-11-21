import type { Agent } from "@houston/engine-adapter";
import type {
  ModelPickerLabels,
  ModelPickerModel,
  ModelPickerProvider,
} from "@houston-ai/core";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { agentSettingsSections } from "../components/agent-settings/agent-settings-nav.ts";
import {
  ceilingEmptyAction,
  ceilingEmptyLabels,
  ceilingEmptyState,
} from "../components/chat-model-selector-ceiling";
import { canOpenAgentSettings } from "../lib/agent-nav";
import { clampPickerToCeiling, hiddenModelCount } from "../lib/ceiling-match";
import { openAgentSettings } from "../lib/open-agent";
import { catalogRunsAs } from "../lib/providers";
import { useCapabilities } from "./use-capabilities";
import type { ChatModelPicker } from "./use-chat-model-picker";
import { usePersonalSpace } from "./use-personal-space";

export interface PickerCeiling {
  models: ModelPickerModel[];
  providers: ModelPickerProvider[];
  hidden: number;
  labels: Partial<ModelPickerLabels>;
  onEmptyStateAction: (() => void) | null | undefined;
}

export function usePickerCeiling(
  picker: ChatModelPicker,
  allowedModels: string[] | null | undefined,
  agent: Pick<Agent, "id" | "access"> | null | undefined,
): PickerCeiling {
  const { t } = useTranslation("chat");
  const { capabilities } = useCapabilities();
  const personalSpace = usePersonalSpace();

  const { models, providers } = useMemo(
    () =>
      clampPickerToCeiling(
        picker.models,
        picker.providers,
        allowedModels,
        catalogRunsAs,
      ),
    [picker.models, picker.providers, allowedModels],
  );

  const hidden = useMemo(
    () => hiddenModelCount(picker.models, allowedModels ?? null, catalogRunsAs),
    [picker.models, allowedModels],
  );

  const ceiling = ceilingEmptyState({
    catalogState: picker.catalogState,
    unclamped: picker.providers,
    clamped: providers,
    canManageAgent: agent ? canOpenAgentSettings(capabilities, agent) : false,
    modelsSectionReachable: agentSettingsSections(
      capabilities,
      personalSpace,
    ).includes("models"),
  });

  const { setOpen } = picker;
  const agentId = agent?.id;
  const chooseModels = useCallback(() => {
    if (!agentId) return;
    setOpen(false);
    openAgentSettings(agentId, "models");
  }, [agentId, setOpen]);

  const labels = useMemo(
    () =>
      ceiling
        ? { ...picker.labels, ...ceilingEmptyLabels(t, ceiling) }
        : picker.labels,
    [ceiling, picker.labels, t],
  );

  const onEmptyStateAction = ceilingEmptyAction(ceiling, chooseModels);

  return { models, providers, hidden, labels, onEmptyStateAction };
}
