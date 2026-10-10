/**
 * The ceiling half of `ChatModelSelector`: clamps the picker to the agent's
 * allowed-models ceiling (Teams E8), counts what the clamp turned off, and,
 * when the clamp empties the list, swaps the "connect an AI" empty state for
 * the honest ceiling one (PRODUCT-2074) with its way to the agent's Models
 * settings. Split from the component so it stays under the file-size budget.
 */

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
  /** Distinct models the ceiling turns off, for the picker's quiet footer. */
  hidden: number;
  labels: Partial<ModelPickerLabels>;
  /** `undefined` keeps the picker's connect action; `null` withholds it. */
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

  // By the gateway's rule. `picker.models` is only built while the popover is
  // open, so this is an empty-in/empty-out no-op when the picker is closed.
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

  // Counted over the full picker universe, not the clamped list, so the clamp
  // above is honest rather than silent.
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
