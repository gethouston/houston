import type { Routine } from "@houston-ai/engine-client";
import { useCallback, useEffect, useState } from "react";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import {
  adoptDraft,
  backToGridIfOn,
  claimedRoutineId,
  resolvePendingActivity,
  type View,
} from "./routines-tab-model";
import type { useRoutineChatSetup } from "./use-routine-chat-setup";

/**
 * The view state machine shared by the Routines and Reactions tabs (both render
 * through `routine-list-tab.tsx`): which surface is showing (grid, an item's
 * chat, or a still-creating draft chat) and the local "Manually" editor flag,
 * plus the effects that move between them. Pure transition logic lives in
 * `routines-tab-model.ts` (node:test-safe); this hook owns only the React state,
 * effects, and the navigation handlers wired to them.
 */
export function useRoutinesTabView(
  agent: Agent,
  routines: Routine[] | undefined,
  chatSetup: ReturnType<typeof useRoutineChatSetup>,
) {
  const [view, setView] = useState<View>({ type: "grid" });
  const [newDraftOpen, setNewDraftOpen] = useState(false);

  // The tab is reused across agents (keyed by tab); reset to the grid on agent
  // switch so an open chat/draft never bleeds between agents' Routines tabs.
  const [trackedAgentId, setTrackedAgentId] = useState(agent.id);
  if (trackedAgentId !== agent.id) {
    setTrackedAgentId(agent.id);
    setView({ type: "grid" });
    setNewDraftOpen(false);
  }

  // A session-finished notification (#401) lands as a one-shot activity id;
  // resolvePendingActivity jumps to its routine/draft chat, or clears a
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
    if (res.action === "open") setView(res.view);
  }, [pendingActivityId, routines, chatSetup, setPendingRoutineActivityId]);

  // Draft → claimed: when the agent creates the routine (stamping the draft's
  // routine_id), swap to the routine's chat so the SAME conversation continues.
  useEffect(() => {
    if (view.type !== "chat-draft" || !view.activityId) return;
    const routineId = claimedRoutineId(view.activityId, routines, chatSetup);
    if (routineId) setView({ type: "chat", routineId });
  }, [view, routines, chatSetup]);

  // "With AI": navigate to the draft chat FIRST (instant loading state), then
  // start it. adoptDraft swaps in the id (or falls back to the grid on failure)
  // only if the user is still waiting on it.
  const handleCreateWithAi = useCallback(async () => {
    setView({ type: "chat-draft", activityId: null });
    const activityId = await chatSetup.startDraft();
    setView((v) => adoptDraft(v, activityId));
  }, [chatSetup]);

  const handleCreateManually = useCallback(() => setNewDraftOpen(true), []);
  const closeNewDraft = useCallback(() => setNewDraftOpen(false), []);

  // "Edit with AI": open the routine's chat, starting one first if it lacks
  // one; a failed start guards back to the grid so it never strands the user.
  const handleEditWithAi = useCallback(
    (routineId: string) => {
      setView({ type: "chat", routineId });
      const routine = routines?.find((r) => r.id === routineId);
      if (routine && !chatSetup.activityFor(routine)) {
        void chatSetup.startForRoutine(routine).then((ok) => {
          if (!ok) setView((v) => backToGridIfOn(v, routineId));
        });
      }
    },
    [routines, chatSetup],
  );

  const handleResumeDraft = useCallback(
    (activityId: string) => setView({ type: "chat-draft", activityId }),
    [],
  );

  const backToGrid = useCallback(() => setView({ type: "grid" }), []);

  return {
    view,
    newDraftOpen,
    closeNewDraft,
    handleCreateWithAi,
    handleCreateManually,
    handleEditWithAi,
    handleResumeDraft,
    backToGrid,
  };
}
