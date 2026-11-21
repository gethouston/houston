import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Activity } from "../../data/activity";
import {
  getConversationStatus,
  useConversationStatus,
} from "../../hooks/use-conversation-vm";
import { queryKeys } from "../../lib/query-keys";
import { showStopFailedToast } from "../../lib/stop-error-toast";
import { tauriChat } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { createBoardConversation } from "./board-create-conversation";
import { sendBoardMessage } from "./board-send-message";
import type { SendOverrides } from "./board-source";
import {
  type BoardRows,
  deriveSessionLoading,
  rowSessionKey,
} from "./session-loading";

export function useAgentBoardSend({
  agent,
  rawItems,
  openSessionKey,
  promptContext,
}: {
  agent: Agent;
  rawItems: Activity[] | undefined;
  openSessionKey: string | null;
  promptContext?: string;
}) {
  const { t } = useTranslation(["board", "chat", "common"]);
  const path = agent.folderPath;
  const addToast = useUIStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const [loadingState, setLoading] = useState<Record<string, boolean>>({});

  const openStatus = useConversationStatus(path, openSessionKey);
  const effectiveLoading = useMemo(() => {
    const rows: BoardRows =
      rawItems === undefined
        ? { present: false }
        : {
            present: true,
            statusBySession: new Map(
              rawItems.map((a) => [rowSessionKey(a), a.status]),
            ),
          };
    return deriveSessionLoading({
      locallySent: loadingState,
      rows,
      openSessionKey,
      vmStatus: (key) =>
        key === openSessionKey ? openStatus : getConversationStatus(path, key),
    });
  }, [loadingState, rawItems, path, openSessionKey, openStatus]);

  const createConversation = useCallback(
    (args: { text: string; files: File[] } & SendOverrides) =>
      createBoardConversation(
        {
          path,
          agentId: agent.id,
          agentName: agent.name,
          agentColor: agent.color,
          queryClient,
          addToast,
          t,
          setSessionLoading: (sessionKey, loading) =>
            setLoading((prev) => ({ ...prev, [sessionKey]: loading })),
        },
        args,
      ),
    [path, agent.id, agent.name, agent.color, queryClient, addToast, t],
  );

  const sendMessageNow = useCallback(
    (
      sessionKey: string,
      text: string,
      files: File[],
      overrides: SendOverrides,
      context?: string,
    ) =>
      sendBoardMessage(
        {
          path,
          agentId: agent.id,
          rawItems,
          promptContext,
          setSessionLoading: (key, loading) =>
            setLoading((prev) => ({ ...prev, [key]: loading })),
        },
        sessionKey,
        text,
        files,
        overrides,
        context,
      ),
    [path, agent.id, rawItems, promptContext],
  );

  const stopSession = useCallback(
    (sessionKey: string) => {
      tauriChat
        .stop(path, sessionKey)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
        })
        .catch(showStopFailedToast);
    },
    [path, queryClient],
  );

  return { effectiveLoading, createConversation, sendMessageNow, stopSession };
}
