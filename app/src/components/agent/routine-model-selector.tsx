/**
 * RoutineModelSelector — the routine screen's model row (PRODUCT-1208, made
 * honest in PRODUCT-1475).
 *
 * It always names the RESOLVED pair — provider + model, e.g. "Claude · Opus 5"
 * — because "Agent's model" told the user nothing about which AI account was
 * about to run (and be billed for) the routine. An unpinned routine resolves
 * through the agent (`useRoutineModelResolution`) and adds a quiet line saying
 * it follows the agent; picking a row pins it, and the picker's footer offers
 * the way back. Reuses `ChatModelSelector` wholesale, so Teams gating
 * (visibility + the allowed-models ceiling) stays one implementation.
 */

import type { Routine, RoutineUpdate } from "@houston-ai/engine-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRoutineWritesForAnyAgent } from "../../hooks/queries";
import { useRoutineModelResolution } from "../../hooks/use-routine-model-resolution";
import { genericErrorDescription } from "../../lib/error-report";
import { providerModelLabel } from "../../lib/model-labels";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { ChatModelSelector } from "../chat-model-selector";

interface Props {
  agent: Agent;
  routine: Routine;
  /** Wrap the trigger in a field-style border (the routine screen's Model
   *  row) so it reads as a control, not floating text. Omit for bare. */
  bordered?: boolean;
}

export function RoutineModelSelector({ agent, routine, bordered }: Props) {
  const { t } = useTranslation("routines");
  const addToast = useUIStore((s) => s.addToast);
  const [open, setOpen] = useState(false);
  const { update: updateRoutine } = useRoutineWritesForAnyAgent();
  const { provider, model, followsAgent, allowedModels } =
    useRoutineModelResolution(agent, routine);

  const save = (updates: RoutineUpdate) =>
    updateRoutine.mutate(
      { agentPath: agent.folderPath, routineId: routine.id, updates },
      {
        onError: (err) =>
          addToast({
            title: t("toasts.modelError"),
            description: genericErrorDescription("set_routine_model", err),
            variant: "error",
          }),
      },
    );

  return (
    // The popover content is portaled, so the field-style border (`bordered`)
    // wraps only the trigger.
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
          save({ provider: nextProvider, model: nextModel })
        }
        open={open}
        onOpenChange={setOpen}
        agent={agent}
        allowedModels={allowedModels}
        coloredGlyph
        // Both states name the pair; only the hint below differs. `undefined`
        // when nothing resolved yet, so the picker's own "Select model" shows
        // rather than a half-built label.
        triggerLabel={providerModelLabel(provider, model) ?? undefined}
        pickerFooter={
          followsAgent ? undefined : (
            <button
              type="button"
              className="w-full rounded-md px-1 py-1 text-left text-xs text-ink-muted hover:bg-hover hover:text-ink transition-colors"
              onClick={() => {
                // `null` clears the pin so the routine follows the agent again
                // (RoutineUpdate contract).
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
