import type { Routine } from "@houston-ai/engine-client";
import type { Agent, AgentDefinition } from "../../lib/types";
import { AutomationIntake, type IntakeResult } from "./automation-intake";
import { RoutineSetupChat } from "./routine-setup-chat";
import type { Selection } from "./routines-tab-model";
import type { useRoutineChatSetup } from "./use-routine-chat-setup";

interface Props {
  /** The active selection (the parent renders this pane only when non-null). */
  selected: Selection;
  agent: Agent;
  agentDef: AgentDefinition;
  routines: Routine[] | undefined;
  chatSetup: ReturnType<typeof useRoutineChatSetup>;
  /** The account-wide zone the intake cards schedule against. */
  accountTimezone: string;
  /** Whether this deployment can offer NEW event triggers (intake gate). */
  triggersAvailable: boolean;
  /** The shell-level panel node this chat portals into (workspace-shell's
   *  sibling panel). Null until the panel mounts. */
  panelContainer: HTMLElement | null;
  onIntakeComplete: (result: IntakeResult) => void;
  onIntakeDismiss: () => void;
  onIntakeSend: (text: string) => void;
  onDeselect: () => void;
}

/**
 * The Routines tab's chat surface: the selected routine's chat, rendered into
 * the shell-level panel (`panelContainer`). Intake runs the create cards over an
 * empty chat surface; a routine/draft continues its real conversation.
 * Extracted from `routines-tab.tsx` so both stay under the size cap — this owns
 * only the selection → surface mapping.
 */
export function RoutinesTabPane({
  selected,
  agent,
  agentDef,
  routines,
  chatSetup,
  accountTimezone,
  triggersAvailable,
  panelContainer,
  onIntakeComplete,
  onIntakeDismiss,
  onIntakeSend,
  onDeselect,
}: Props) {
  if (selected.kind === "intake") {
    return (
      <RoutineSetupChat
        agent={agent}
        agentDef={agentDef}
        activity={null}
        kind="intake"
        panelContainer={panelContainer}
        onClose={onIntakeDismiss}
        onIntakeSend={onIntakeSend}
        intakeOverlay={
          <AutomationIntake
            agent={agent}
            accountTimezone={accountTimezone}
            triggersAvailable={triggersAvailable}
            onComplete={onIntakeComplete}
            onDismiss={onIntakeDismiss}
          />
        }
      />
    );
  }

  const routine =
    selected.kind === "routine"
      ? routines?.find((r) => r.id === selected.routineId)
      : undefined;
  const activity =
    selected.kind === "routine"
      ? routine
        ? chatSetup.activityFor(routine)
        : null
      : selected.activityId
        ? (chatSetup.draftActivities.find(
            (a) => a.id === selected.activityId,
          ) ?? null)
        : null;

  return (
    <RoutineSetupChat
      agent={agent}
      agentDef={agentDef}
      activity={activity}
      kind={selected.kind === "routine" ? "routine" : "draft"}
      routineName={routine?.name}
      routine={routine}
      panelContainer={panelContainer}
      onClose={onDeselect}
    />
  );
}
