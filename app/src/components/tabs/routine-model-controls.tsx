import { useCallback } from "react";
import type { RoutineFormData } from "@houston-ai/routines";
import { ChatModelSelector } from "../chat-model-selector";
import { ChatEffortSelector } from "../chat-effort-selector";
import { useAgentConfig } from "../../hooks/queries";
import { routineModelPickerDefaults } from "./routines-tab-model";

/**
 * Provider + model + effort controls for the routine editor, injected into
 * `RoutineEditor`'s `modelPicker` slot so `ui/routines` stays provider-agnostic
 * (it never imports the provider catalog or these app pickers).
 *
 * The displayed selection is the routine's own pin when set, else the agent's
 * configured default (read here via `useAgentConfig`), else the platform
 * default. Picking a model/effort pins it on the form; leaving it untouched
 * keeps the routine inheriting the agent's config at dispatch. The effort
 * control hides itself for models with no effort levels (e.g. Gemini).
 */
export function RoutineModelControls({
  agentPath,
  form,
  onChange,
}: {
  agentPath: string;
  form: RoutineFormData;
  onChange: (patch: Partial<RoutineFormData>) => void;
}) {
  const { data: agentConfig } = useAgentConfig(agentPath);
  const { provider, model, effort } = routineModelPickerDefaults(form, agentConfig);

  const onModel = useCallback(
    (p: string, m: string) => onChange({ provider: p, model: m }),
    [onChange],
  );
  const onEffort = useCallback(
    (e: string) => onChange({ effort: e }),
    [onChange],
  );

  return (
    <div className="flex items-center gap-1">
      <ChatModelSelector provider={provider} model={model} onSelect={onModel} />
      <ChatEffortSelector
        provider={provider}
        model={model}
        effort={effort}
        onSelect={onEffort}
      />
    </div>
  );
}
