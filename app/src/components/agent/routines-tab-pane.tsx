import type { Routine } from "@houston/engine-adapter";
import type { RoutineRun } from "@houston-ai/routines";
import type { Agent } from "../../lib/types";
import { AutomationIntake, type IntakeResult } from "./automation-intake";
import { RoutineSetupChat } from "./routine-setup-chat";
import { runChatActivity, type Selection } from "./routines-tab-model";
import type { useRoutineChatSetup } from "./use-routine-chat-setup";

interface Props {
  selected: Selection;
  agent: Agent;
  routines: Routine[] | undefined;
  chatSetup: ReturnType<typeof useRoutineChatSetup>;
  allRuns: RoutineRun[] | undefined;
  accountTimezone: string;
  triggersAvailable: boolean;
  panelContainer: HTMLElement | null;
  onIntakeComplete: (result: IntakeResult) => void;
  onIntakeDismiss: () => void;
  onIntakeSend: (text: string) => void;
  onDeselect: () => void;
  onBackToRoutine: (routineId: string) => void;
}

export function RoutinesTabPane({
  selected,
  agent,
  routines,
  chatSetup,
  allRuns,
  accountTimezone,
  triggersAvailable,
  panelContainer,
  onIntakeComplete,
  onIntakeDismiss,
  onIntakeSend,
  onDeselect,
  onBackToRoutine,
}: Props) {
  if (selected.kind === "intake") {
    return (
      <RoutineSetupChat
        agent={agent}
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

  if (selected.kind === "draft") {
    const activity = selected.activityId
      ? (chatSetup.draftActivities.find((a) => a.id === selected.activityId) ??
        null)
      : null;
    return (
      <RoutineSetupChat
        agent={agent}
        activity={activity}
        kind="draft"
        panelContainer={panelContainer}
        onClose={onDeselect}
      />
    );
  }

  if (selected.kind !== "routineChat" && selected.kind !== "runChat")
    return null;

  const routine = routines?.find((r) => r.id === selected.routineId);
  if (!routine) return null;

  const activity =
    selected.kind === "runChat"
      ? runChatActivity(
          routine,
          selected.runId,
          allRuns?.find((r) => r.id === selected.runId),
        )
      : chatSetup.activityFor(routine);

  return (
    <RoutineSetupChat
      agent={agent}
      activity={activity}
      kind="routine"
      routineName={routine.name}
      routine={routine}
      panelContainer={panelContainer}
      onClose={() => onBackToRoutine(routine.id)}
    />
  );
}
