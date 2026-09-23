/**
 * Writes to the OPEN mission's persisted `pending_interaction`.
 *
 * Extracted from `useAgentChatPanel` so the card surfaces there stay
 * presentational: both writers share one persist-then-repaint path (the
 * activity write does NOT self-toast — it's the data layer, not a `call()` —
 * so a failure surfaces here, and the query invalidations are the AI-native
 * repaint, since the runtime transcript write fires no chat-history event).
 */

import type { PendingInteraction } from "@houston/protocol";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../lib/error-report";
import { type DismissalWrite, foldDismissal } from "../lib/interaction-dismiss";
import { queryKeys } from "../lib/query-keys";
import { tauriActivity } from "../lib/tauri";
import { useUIStore } from "../stores/ui";

export interface PersistedInteractionWriters {
  /**
   * Clear the whole persisted interaction (the user interrupted a sequence).
   *
   * Resolves TRUE only when the card is genuinely gone — the activity write
   * landed, or there was no activity holding one. A failed write toasts and
   * resolves false rather than throwing (as does a call made with no agent
   * path, which writes nothing), so the caller must not read the awaited call
   * as confirmation on its own.
   */
  clearPersistedInteraction: () => Promise<boolean>;
  /**
   * Persist `interaction` minus ONE step — the per-offer dismissal, so skipping
   * the action bubbles never takes the save-as-reusable card with it. The
   * interaction is passed in (not closed over) so the callback identity stays
   * stable across activity refetches: the panel's composer-override memo resets
   * the in-progress step outcomes whenever its callbacks change identity.
   *
   * Sequential dismissals of the SAME interaction compose (the second write is
   * the first one's remainder minus its step, never the full settle-time
   * sequence again), and dismissing a step that is already gone writes nothing
   * at all.
   */
  dismissInteractionStep: (
    interaction: PendingInteraction,
    stepId: string,
  ) => Promise<void>;
  /**
   * Repaint only, no write: the runtime refused the dismiss because a turn is
   * running on this chat, so the card was stale. Refetching the activity and
   * the transcript brings this window up to the turn the runtime sees; a
   * clear here would race that turn's settle write and wipe the card it is
   * about to leave.
   */
  resyncInteraction: () => void;
}

export function usePersistedInteraction(args: {
  agentPath: string | null;
  activityId: string | null;
  sessionKey: string | null;
}): PersistedInteractionWriters {
  const { agentPath, activityId, sessionKey } = args;
  const { t } = useTranslation(["chat"]);
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  const resyncInteraction = useCallback(() => {
    if (!agentPath) return;
    queryClient.invalidateQueries({
      queryKey: queryKeys.activity(agentPath),
    });
    if (sessionKey)
      queryClient.invalidateQueries({
        queryKey: queryKeys.chatHistory(agentPath, sessionKey),
      });
  }, [agentPath, sessionKey, queryClient]);

  // Keyed on the STABLE id strings (never the activity object), so an activity
  // query refetch mid-sequence hands the panel the same callbacks.
  // Reports whether the write LANDED, in three outcomes: true when the activity
  // took it (or there was no activity holding one), false + a toast when the
  // write failed (the user is told, nothing throws), and false with NO toast
  // when there is no agent path — nothing was attempted, so there is nothing to
  // tell the user. The panel guards on the path before it ever gets here; the
  // boolean is the only way a caller can tell a persisted card that is gone
  // from one that is still there.
  const persist = useCallback(
    async (next: PendingInteraction | null): Promise<boolean> => {
      if (!agentPath) return false;
      let written = true;
      if (activityId) {
        try {
          await tauriActivity.update(agentPath, activityId, {
            pending_interaction: next,
          });
        } catch (err) {
          written = false;
          addToast({
            title: t("chat:errors.interactionDismissFailed"),
            description: genericErrorDescription("interaction_dismiss", err),
            variant: "error",
          });
        }
      }
      resyncInteraction();
      return written;
    },
    [agentPath, activityId, resyncInteraction, addToast, t],
  );

  const clearPersistedInteraction = useCallback(() => persist(null), [persist]);

  // The LAST per-step dismissal this panel wrote, so the next one chains from
  // its remainder instead of from the (unchanged) live interaction the caller
  // renders — see `foldDismissal`. A ref, not state: it must not repaint, and
  // the identity check inside the fold is what scopes it to one interaction.
  const lastWrite = useRef<DismissalWrite | null>(null);

  const dismissInteractionStep = useCallback(
    async (interaction: PendingInteraction, stepId: string) => {
      const write = foldDismissal(lastWrite.current, interaction, stepId);
      // Nothing changed: no write, no invalidation, no repaint.
      if (!write) return;
      lastWrite.current = write;
      // The remainder is chained from `lastWrite`, so a failed write is already
      // told to the user and nothing here branches on it.
      await persist(write.written);
    },
    [persist],
  );

  return {
    clearPersistedInteraction,
    dismissInteractionStep,
    resyncInteraction,
  };
}
