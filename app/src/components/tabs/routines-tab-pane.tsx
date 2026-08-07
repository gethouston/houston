import type { Routine } from "@houston-ai/engine-client";
import type { RoutineRun } from "@houston-ai/routines";
import type { Agent, AgentDefinition } from "../../lib/types";
import { AutomationIntake, type IntakeResult } from "./automation-intake";
import { RoutineDetailPane } from "./routine-detail-pane";
import { RoutineSetupChat } from "./routine-setup-chat";
import { runChatActivity, type Selection } from "./routines-tab-model";
import type { useRoutineChatSetup } from "./use-routine-chat-setup";

interface Props {
  /** The active selection (the parent renders this pane only when non-null). */
  selected: Selection;
  agent: Agent;
  agentDef: AgentDefinition;
  routines: Routine[] | undefined;
  chatSetup: ReturnType<typeof useRoutineChatSetup>;
  /** ALL of the agent's runs (the tab's cached query); the detail screen and
   *  the run-chat lookup both narrow by routine here. */
  allRuns: RoutineRun[] | undefined;
  runsLoading: boolean;
  /** Humanized event summaries per trigger routine (useRoutineTriggers). */
  triggerSummaries: Record<string, string>;
  /** The account-wide zone the intake cards + schedules run against. */
  accountTimezone: string;
  /** Whether this deployment can offer NEW event triggers (intake gate). */
  triggersAvailable: boolean;
  /** The shell-level panel node this pane portals into (workspace-shell's
   *  sibling panel). Null until the panel mounts. */
  panelContainer: HTMLElement | null;
  onIntakeComplete: (result: IntakeResult) => void;
  onIntakeDismiss: () => void;
  onIntakeSend: (text: string) => void;
  onDeselect: () => void;
  /** Detail screen -> the routine's setup chat. */
  onOpenChat: (routineId: string) => void;
  /** Detail screen -> one execution's chat (its result). */
  onOpenRun: (routineId: string, runId: string) => void;
  /** A chat's Back affordance -> the routine's detail screen. */
  onBackToRoutine: (routineId: string) => void;
}

/**
 * The Routines tab's right-hand pane (PRODUCT-1208): the selection → surface
 * mapping, rendered into the shell-level panel. A selected routine opens its
 * own SCREEN (name, what it does, when it runs, model, execution history);
 * its chats — the setup chat and each execution's result chat — open from
 * that screen with a Back affordance. Intake and drafts are chat surfaces of
 * their own, unchanged.
 */
export function RoutinesTabPane({
  selected,
  agent,
  agentDef,
  routines,
  chatSetup,
  allRuns,
  runsLoading,
  triggerSummaries,
  accountTimezone,
  triggersAvailable,
  panelContainer,
  onIntakeComplete,
  onIntakeDismiss,
  onIntakeSend,
  onDeselect,
  onOpenChat,
  onOpenRun,
  onBackToRoutine,
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

  if (selected.kind === "draft") {
    const activity = selected.activityId
      ? (chatSetup.draftActivities.find((a) => a.id === selected.activityId) ??
        null)
      : null;
    return (
      <RoutineSetupChat
        agent={agent}
        agentDef={agentDef}
        activity={activity}
        kind="draft"
        panelContainer={panelContainer}
        onClose={onDeselect}
      />
    );
  }

  const routine = routines?.find((r) => r.id === selected.routineId);
  if (!routine) return null; // deleted under the selection; the pane just closes

  // One execution's chat: a synthetic activity over the run's real session key.
  // A pruned run (the 50-cap) falls through to the detail screen instead.
  const run =
    selected.kind === "runChat"
      ? allRuns?.find((r) => r.id === selected.runId)
      : undefined;
  if (selected.kind === "runChat" && run) {
    return (
      <RoutineSetupChat
        agent={agent}
        agentDef={agentDef}
        activity={runChatActivity(routine, run)}
        kind="routine"
        routineName={routine.name}
        routine={routine}
        panelContainer={panelContainer}
        onClose={onDeselect}
        onBack={() => onBackToRoutine(routine.id)}
      />
    );
  }

  if (selected.kind === "routineChat") {
    return (
      <RoutineSetupChat
        agent={agent}
        agentDef={agentDef}
        activity={chatSetup.activityFor(routine)}
        kind="routine"
        routineName={routine.name}
        routine={routine}
        panelContainer={panelContainer}
        onClose={onDeselect}
        onBack={() => onBackToRoutine(routine.id)}
      />
    );
  }

  return (
    <RoutineDetailPane
      agent={agent}
      routine={routine}
      allRuns={allRuns}
      runsLoading={runsLoading}
      triggerSummary={triggerSummaries[routine.id]}
      accountTimezone={accountTimezone}
      panelContainer={panelContainer}
      onOpenChat={() => onOpenChat(routine.id)}
      onOpenRun={(r) => onOpenRun(routine.id, r.id)}
      onClose={onDeselect}
    />
  );
}
