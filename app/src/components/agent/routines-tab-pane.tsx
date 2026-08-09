import type { Routine } from "@houston-ai/engine-client";
import type { RoutineRun } from "@houston-ai/routines";
import type { Agent } from "../../lib/types";
import { AutomationIntake, type IntakeResult } from "./automation-intake";
import { RoutineSetupChat } from "./routine-setup-chat";
import { runChatActivity, type Selection } from "./routines-tab-model";
import type { useRoutineChatSetup } from "./use-routine-chat-setup";

interface Props {
  /** The active selection (the parent renders this pane only when non-null). */
  selected: Selection;
  agent: Agent;
  routines: Routine[] | undefined;
  chatSetup: ReturnType<typeof useRoutineChatSetup>;
  /** ALL of the agent's runs (the tab's cached query) — the run-chat lookup
   *  narrows by id here. */
  allRuns: RoutineRun[] | undefined;
  /** The account-wide zone the intake cards schedule against. */
  accountTimezone: string;
  /** Whether this deployment can offer NEW event triggers (intake gate). */
  triggersAvailable: boolean;
  /** The shell-level panel node the chats portal into (workspace-shell's
   *  sibling panel). Null until the panel mounts. */
  panelContainer: HTMLElement | null;
  onIntakeComplete: (result: IntakeResult) => void;
  onIntakeDismiss: () => void;
  onIntakeSend: (text: string) => void;
  onDeselect: () => void;
  /** Closing a routine's chat returns to its screen in the main content. */
  onBackToRoutine: (routineId: string) => void;
}

/**
 * The Routines section's CHAT surfaces, rendered into the shell-level panel
 * (PRODUCT-1208): the create intake, a draft's chat, a routine's setup chat,
 * and one execution's result chat. The routine's own screen is NOT here — it
 * replaces the section's main content (`routine-screen.tsx`); a chat opened from
 * that screen closes back to it, so the X (and Escape) never strand the user.
 */
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
    return null; // kind "routine" renders in the main content, never here

  const routine = routines?.find((r) => r.id === selected.routineId);
  if (!routine) return null; // deleted under the selection; the pane just closes

  // One execution's chat: a synthetic activity over the run's real session
  // key (reconstructable from the routine + run id even if the record was
  // pruned by the 50-run cap while the chat was open).
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
