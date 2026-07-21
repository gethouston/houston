import type { Routine } from "@houston-ai/engine-client";
import { useCallback, useEffect, useState } from "react";
import { analytics } from "../../lib/analytics";
import { encodeRoutineIntakeHandoffMessage } from "../../lib/routine-chat-handoff";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import type { IntakeResult } from "./automation-intake";
import {
  adoptDraft,
  claimedRoutineId,
  deselectIfOn,
  resolvePendingActivity,
  type Selection,
  toggleRoutine,
} from "./routines-tab-model";
import type { useRoutineChatSetup } from "./use-routine-chat-setup";

/**
 * The Automations tab's selection state machine (`routines-tab.tsx`): which
 * item — if any — owns the right-hand chat pane, and the effects that move the
 * cursor. The list is ALWAYS visible now (email-client split), so this is a
 * cursor into it, never a full-page view swap. Pure transition logic lives in
 * `routines-tab-model.ts` (node:test-safe); this hook owns only the React
 * state, effects, and the selection handlers.
 */
export function useRoutinesTabView(
  agent: Agent,
  routines: Routine[] | undefined,
  chatSetup: ReturnType<typeof useRoutineChatSetup>,
) {
  const [selected, setSelected] = useState<Selection | null>(null);

  // The tab is reused across agents (keyed by tab); clear the selection on
  // agent switch so nothing — not even a half-finished intake — ever bleeds
  // between agents' Automations tabs.
  const [trackedAgentId, setTrackedAgentId] = useState(agent.id);
  if (trackedAgentId !== agent.id) {
    setTrackedAgentId(agent.id);
    setSelected(null);
  }

  // A session-finished notification (#401) lands as a one-shot activity id;
  // resolvePendingActivity selects its routine/draft chat, or clears a
  // stale/foreign id once both data sources have loaded (see the helper).
  const pendingActivityId = useUIStore((s) => s.pendingRoutineActivityId);
  const setPendingRoutineActivityId = useUIStore(
    (s) => s.setPendingRoutineActivityId,
  );
  useEffect(() => {
    if (!pendingActivityId) return;
    const res = resolvePendingActivity(pendingActivityId, routines, chatSetup);
    if (res.action === "wait") return;
    setPendingRoutineActivityId(null);
    if (res.action === "open") setSelected(res.selection);
  }, [pendingActivityId, routines, chatSetup, setPendingRoutineActivityId]);

  // Draft → claimed: when the agent creates the routine (stamping the draft's
  // routine_id), swap the selection to the routine's chat so the SAME
  // conversation continues seamlessly in the same pane.
  useEffect(() => {
    if (selected?.kind !== "draft" || !selected.activityId) return;
    const routineId = claimedRoutineId(
      selected.activityId,
      routines,
      chatSetup,
    );
    if (routineId) setSelected({ kind: "routine", routineId });
  }, [selected, routines, chatSetup]);

  // "New routine": select the intake instantly — the chat surface with
  // the locally-driven question cards floating over it, before any model call.
  const openIntake = useCallback(() => setSelected({ kind: "intake" }), []);

  // Dismiss the intake without creating anything (its cards' own dismiss, or
  // Escape): the only exit that isn't a completion, so the dismissal signal
  // fires here.
  const dismissIntake = useCallback(() => {
    setSelected(null);
    analytics.track("routine_intake_dismissed");
  }, []);

  // Intake completed: create the draft setup chat exactly like the old "With
  // AI" flow (select the draft FIRST for the instant calm surface, then start
  // it), seeded with everything the cards collected. adoptDraft swaps in the id
  // (or clears the selection on failure) only if the user is still waiting.
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

  // The cards resolved to a full intent + wake (or a prefilled template). The
  // template picker stamps `templateId`, so the source is unambiguous.
  const handleIntakeComplete = useCallback(
    (result: IntakeResult) =>
      void completeIntake(
        result,
        result.templateId ? "template" : "custom",
        result.templateId,
      ),
    [completeIntake],
  );

  // Composer escape hatch: typing and sending during intake abandons the cards
  // and hands the typed text straight to the agent as the intent (no wake, no
  // chat bubble — the handoff carries it).
  const handleIntakeComposerSend = useCallback(
    (text: string) =>
      void completeIntake(
        { intent: text, wake: null, scheduleHint: null },
        "composer",
      ),
    [completeIntake],
  );

  // Row click ("open chat"): select the routine's chat (starting one first if
  // it lacks one), or deselect it when it is already the open one (re-click).
  // A failed start clears the selection so it never strands the user.
  const handleOpenChat = useCallback(
    (routineId: string) => {
      const next = toggleRoutine(selected, routineId);
      setSelected(next);
      if (next?.kind !== "routine") return; // re-click deselected it
      const routine = routines?.find((r) => r.id === routineId);
      if (routine && !chatSetup.activityFor(routine)) {
        void chatSetup.startForRoutine(routine).then((ok) => {
          if (!ok) setSelected((s) => deselectIfOn(s, routineId));
        });
      }
    },
    [selected, routines, chatSetup],
  );

  const handleResumeDraft = useCallback(
    (activityId: string) => setSelected({ kind: "draft", activityId }),
    [],
  );

  // Panel close / Escape from an item's chat: clear the selection, closing the
  // pane and returning the list to full width.
  const deselect = useCallback(() => setSelected(null), []);

  return {
    selected,
    openIntake,
    dismissIntake,
    handleIntakeComplete,
    handleIntakeComposerSend,
    handleOpenChat,
    handleResumeDraft,
    deselect,
  };
}
