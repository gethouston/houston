import type { Routine } from "@houston/engine-adapter";
import { useCallback, useEffect, useState } from "react";
import { analytics } from "../../lib/analytics";
import { encodeRoutineIntakeHandoffMessage } from "../../lib/routine-chat-handoff";
import { useUIStore } from "../../stores/ui";
import type { IntakeResult } from "./automation-intake";
import {
  adoptDraft,
  claimedRoutineId,
  clearMissingRoutine,
  deselectIfOn,
  resolvePendingActivity,
  type Selection,
  toggleRoutine,
} from "./routines-tab-model";
import type { useRoutineChatSetup } from "./use-routine-chat-setup";

export function useRoutinesTabView(
  routines: Routine[] | undefined,
  chatSetup: ReturnType<typeof useRoutineChatSetup>,
  agentId: string,
) {
  const [selected, setSelected] = useState<Selection | null>(null);

  const pending = useUIStore((s) => s.pendingRoutineChat);
  const setPendingRoutineChat = useUIStore((s) => s.setPendingRoutineChat);
  const pendingActivityId =
    pending && pending.agentId === agentId ? pending.activityId : null;
  useEffect(() => {
    if (!pendingActivityId) return;
    const res = resolvePendingActivity(pendingActivityId, routines, chatSetup);
    if (res.action === "wait") return;
    setPendingRoutineChat(null);
    if (res.action === "open") setSelected(res.selection);
  }, [pendingActivityId, routines, chatSetup, setPendingRoutineChat]);

  useEffect(() => {
    setSelected((s) => clearMissingRoutine(s, routines));
  }, [routines]);

  useEffect(() => {
    if (selected?.kind !== "draft" || !selected.activityId) return;
    const routineId = claimedRoutineId(
      selected.activityId,
      routines,
      chatSetup,
    );
    if (routineId) setSelected({ kind: "routineChat", routineId });
  }, [selected, routines, chatSetup]);

  const openIntake = useCallback(() => setSelected({ kind: "intake" }), []);

  const dismissIntake = useCallback(() => {
    setSelected(null);
    analytics.track("routine_intake_dismissed");
  }, []);

  const completeIntake = useCallback(
    async (
      result: Pick<IntakeResult, "intent" | "wake" | "scheduleHint">,
      source: "custom" | "template" | "composer",
      templateId?: string,
    ) => {
      analytics.track("routine_intake_completed", {
        wake_kind: result.wake?.kind,
        source,
        ...(templateId ? { template_id: templateId } : {}),
      });
      setSelected({ kind: "draft", activityId: null });
      const activityId = await chatSetup.startDraft((id) =>
        encodeRoutineIntakeHandoffMessage(id, chatSetup.connectedProviders, {
          intent: result.intent,
          wake: result.wake,
          scheduleHint: result.scheduleHint,
        }),
      );
      setSelected((s) => adoptDraft(s, activityId));
    },
    [chatSetup],
  );

  const handleIntakeComplete = useCallback(
    (result: IntakeResult) =>
      void completeIntake(
        result,
        result.templateId ? "template" : "custom",
        result.templateId,
      ),
    [completeIntake],
  );

  const handleIntakeComposerSend = useCallback(
    (text: string) =>
      void completeIntake(
        { intent: text, wake: null, scheduleHint: null },
        "composer",
      ),
    [completeIntake],
  );

  const handleOpenRoutine = useCallback(
    (routineId: string) => setSelected(toggleRoutine(selected, routineId)),
    [selected],
  );

  const openRoutineChat = useCallback(
    (routineId: string) => {
      setSelected({ kind: "routineChat", routineId });
      const routine = routines?.find((r) => r.id === routineId);
      if (routine && !chatSetup.activityFor(routine)) {
        void chatSetup.startForRoutine(routine).then((ok) => {
          if (!ok) setSelected((s) => deselectIfOn(s, routineId));
        });
      }
    },
    [routines, chatSetup],
  );

  const openRun = useCallback(
    (routineId: string, runId: string) =>
      setSelected({ kind: "runChat", routineId, runId }),
    [],
  );

  const backToRoutine = useCallback(
    (routineId: string) => setSelected({ kind: "routine", routineId }),
    [],
  );

  const handleResumeDraft = useCallback(
    (activityId: string) => setSelected({ kind: "draft", activityId }),
    [],
  );

  const deselect = useCallback(() => setSelected(null), []);

  return {
    selected,
    openIntake,
    dismissIntake,
    handleIntakeComplete,
    handleIntakeComposerSend,
    handleOpenRoutine,
    openRoutineChat,
    openRun,
    backToRoutine,
    handleResumeDraft,
    deselect,
  };
}
