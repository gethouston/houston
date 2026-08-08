/**
 * RoutineModelSelector — the routine chat header's model pin (PRODUCT-1208).
 * A routine already carries `provider`/`model` overrides that the fire path
 * honors (`routinePin`); this is the surface that finally lets the user set
 * them. Unpinned shows "Agent's model" (the routine inherits whatever the
 * agent runs on); picking a row pins it, and the picker's footer offers the
 * way back to inherit. Reuses `ChatModelSelector` wholesale, so Teams gating
 * (visibility + the allowed-models ceiling) stays one implementation.
 */

import type { Routine, RoutineUpdate } from "@houston-ai/engine-client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAgentModelChoice, useUpdateRoutine } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { genericErrorDescription } from "../../lib/error-report";
import { modelSelectorDecision } from "../../lib/model-selector-lock";
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
  const updateRoutine = useUpdateRoutine(agent.folderPath);

  // Teams E8: the pickable set is clamped to the agent's allowed-models
  // ceiling, exactly like the composer's picker (ChatModelSelector applies the
  // clamp; this only fetches the ceiling when the deployment has one).
  const { capabilities } = useCapabilities();
  const { personal } = modelSelectorDecision(capabilities, agent);
  const { data: choiceInfo } = useAgentModelChoice(agent.id, personal);
  const allowedModels = personal ? (choiceInfo?.allowedModels ?? null) : null;

  const pinned = !!routine.provider && !!routine.model;
  const save = (updates: RoutineUpdate) =>
    updateRoutine.mutate(
      { routineId: routine.id, updates },
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
        provider={routine.provider ?? ""}
        model={routine.model ?? ""}
        onSelect={(provider, model) => save({ provider, model })}
        open={open}
        onOpenChange={setOpen}
        agent={agent}
        allowedModels={allowedModels}
        coloredGlyph
        triggerLabel={pinned ? undefined : t("details.model.inherit")}
        pickerFooter={
          pinned ? (
            <button
              type="button"
              className="w-full rounded-md px-1 py-1 text-left text-xs text-ink-muted hover:bg-hover hover:text-ink transition-colors"
              onClick={() => {
                // `null` clears the pin back to inherit (RoutineUpdate contract).
                save({ provider: null, model: null, effort: null });
                setOpen(false);
              }}
            >
              {t("details.model.reset")}
            </button>
          ) : undefined
        }
      />
    </span>
  );
}
