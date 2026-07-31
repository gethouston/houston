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
  /** Clear the whole persisted interaction (the user interrupted a sequence). */
  clearPersistedInteraction: () => Promise<void>;
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

  // Keyed on the STABLE id strings (never the activity object), so an activity
  // query refetch mid-sequence hands the panel the same callbacks.
  const persist = useCallback(
    async (next: PendingInteraction | null) => {
      if (!agentPath) return;
      if (activityId) {
        try {
          await tauriActivity.update(agentPath, activityId, {
            pending_interaction: next,
          });
        } catch (err) {
          addToast({
            title: t("chat:errors.interactionDismissFailed"),
            description: genericErrorDescription("interaction_dismiss", err),
            variant: "error",
          });
        }
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.activity(agentPath),
      });
      if (sessionKey)
        queryClient.invalidateQueries({
          queryKey: queryKeys.chatHistory(agentPath, sessionKey),
        });
    },
    [agentPath, activityId, sessionKey, queryClient, addToast, t],
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
      await persist(write.written);
    },
    [persist],
  );

  return { clearPersistedInteraction, dismissInteractionStep };
}
