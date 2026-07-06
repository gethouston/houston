import type { Agent } from "@houston-ai/engine-client";
import type { RoutineFormData } from "@houston-ai/routines";
import { useCallback } from "react";
import { useAgentConfig } from "../../hooks/queries";
import { ChatEffortSelector } from "../chat-effort-selector";
import { ChatModelSelector } from "../chat-model-selector";
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
 *
 * The `agent` is threaded into both selectors so a plain org member never sees
 * the AI model here either (Teams matrix v2): the picker HIDES for members, the
 * same as the composer. Managers / single-player keep it fully interactive.
 */
export function RoutineModelControls({
  agent,
  agentPath,
  form,
  onChange,
}: {
  agent: Pick<Agent, "access">;
  agentPath: string;
  form: RoutineFormData;
  onChange: (patch: Partial<RoutineFormData>) => void;
}) {
  const { data: agentConfig } = useAgentConfig(agentPath);
  const { provider, model, effort } = routineModelPickerDefaults(
    form,
    agentConfig,
  );

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
      <ChatModelSelector
        provider={provider}
        model={model}
        onSelect={onModel}
        agent={agent}
      />
      <ChatEffortSelector
        provider={provider}
        model={model}
        effort={effort}
        onSelect={onEffort}
        agent={agent}
      />
    </div>
  );
}
