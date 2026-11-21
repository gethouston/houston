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
  clearPersistedInteraction: () => Promise<boolean>;
  dismissInteractionStep: (
    interaction: PendingInteraction,
    stepId: string,
  ) => Promise<void>;
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

  const lastWrite = useRef<DismissalWrite | null>(null);

  const dismissInteractionStep = useCallback(
    async (interaction: PendingInteraction, stepId: string) => {
      const write = foldDismissal(lastWrite.current, interaction, stepId);
      if (!write) return;
      lastWrite.current = write;
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
