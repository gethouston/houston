import type { Routine, RoutineUpdate } from "@houston/engine-adapter";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRoutineWritesForAnyAgent } from "../../hooks/queries";
import { useRoutineModelResolution } from "../../hooks/use-routine-model-resolution";
import { providerModelLabel } from "../../lib/model-labels";
import { toCanonicalProviderId } from "../../lib/provider-overrides";
import type { Agent } from "../../lib/types";
import { ChatModelSelector } from "../chat-model-selector";

interface Props {
  agent: Agent;
  routine: Routine;
  bordered?: boolean;
}

export function RoutineModelSelector({ agent, routine, bordered }: Props) {
  const { t } = useTranslation("routines");
  const [open, setOpen] = useState(false);
  const { update: updateRoutine } = useRoutineWritesForAnyAgent();
  const { provider, model, followsAgent, allowedModels } =
    useRoutineModelResolution(agent, routine);

  const save = (updates: RoutineUpdate) =>
    updateRoutine.mutate({
      agentPath: agent.folderPath,
      routineId: routine.id,
      updates,
      kind: "model",
    });

  return (
    <span
      className={
        bordered
          ? "inline-flex rounded-lg border border-line-input bg-input"
          : "contents"
      }
    >
      <ChatModelSelector
        provider={provider}
        model={model}
        onSelect={(nextProvider, nextModel) =>
          save({
            provider: toCanonicalProviderId(nextProvider),
            model: nextModel,
          })
        }
        open={open}
        onOpenChange={setOpen}
        agent={agent}
        allowedModels={allowedModels}
        coloredGlyph
        triggerLabel={providerModelLabel(provider, model) ?? undefined}
        pickerFooter={
          followsAgent ? undefined : (
            <button
              type="button"
              className="w-full rounded-md px-1 py-1 text-left text-xs text-ink-muted hover:bg-hover hover:text-ink transition-colors"
              onClick={() => {
                save({ provider: null, model: null, effort: null });
                setOpen(false);
              }}
            >
              {t("details.model.reset")}
            </button>
          )
        }
      />
    </span>
  );
}
